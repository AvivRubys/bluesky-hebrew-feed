import { AsyncIterable } from 'ix';
import { Commit } from './lexicon/types/com/atproto/sync/subscribeRepos';
import logger from './logger';
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription';
import { extractTextLanguage } from './util/hebrew';

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleCommits(commits: Commit[]) {
    const ops = await Promise.all(commits.map(getOpsByType));
    const postsToDelete = ops
      .flatMap((op) => op.posts.deletes)
      .map((del) => del.uri);
    const postsToCreate = await AsyncIterable.from(ops)
      .flatMap((op) => op.posts.creates)
      .flatMap(async (create) => {
        const language = await extractTextLanguage(create.record.text);

        if (typeof language === 'undefined') {
          return [];
        }

        return [
          {
            uri: create.uri,
            cid: create.cid,
            replyTo: create.record.reply?.parent.uri,
            replyRoot: create.record.reply?.root.uri,
            indexedAt: new Date().toISOString(),
            language,
          },
        ];
      })
      .toArray();

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
