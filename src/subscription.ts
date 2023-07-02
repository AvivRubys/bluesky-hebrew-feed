import {
  Commit,
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos';
import logger from './logger';
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription';

const hebrewLetters = new Set('אבגדהוזחטיכךלמםנןסעפףצץקרשת'.split(''));
function isHebrewText(text: string) {
  for (const letter of text) {
    if (hebrewLetters.has(letter)) {
      return true;
    }
  }

  return false;
}

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleCommits(commits: Commit[]) {
    const ops = await Promise.all(commits.map(getOpsByType));
    const postsToDelete = ops
      .flatMap((op) => op.posts.deletes)
      .map((del) => del.uri);
    const postsToCreate = ops
      .flatMap((op) => op.posts.creates)
      .filter((create) => isHebrewText(create.record.text))
      .map((create) => ({
        uri: create.uri,
        cid: create.cid,
        indexedAt: new Date().toISOString(),
      }));

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute();
    }

    if (postsToCreate.length > 0) {
      logger.info('Creating %d posts', postsToCreate.length);

      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  }
}
