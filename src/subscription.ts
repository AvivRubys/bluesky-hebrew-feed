import { AsyncIterable } from 'ix';
import { RichText } from '@atproto/api';
import { Counter } from 'prom-client';
import { Commit } from './lexicon/types/com/atproto/sync/subscribeRepos';
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription';
import { extractTextLanguage, hasHebrewLetters } from './util/hebrew';
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post';

const indexerPostsCreated = new Counter({
  name: 'indexer_posts_created',
  help: 'Posts indexed',
});

const indexerPostsDeleted = new Counter({
  name: 'indexer_posts_deleted',
  help: 'Posts deleted',
});

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleCommits(commits: Commit[]) {
    const ops = await Promise.all(commits.map(getOpsByType));
    const postsToCreate = await AsyncIterable.from(ops)
      .flatMap((op) => op.posts.creates)
      .filter((op) => hasHebrewLetters(op.record.text))
      .map(async (create) => {
        const language = await extractTextLanguage(removeFacets(create.record));

        return {
          uri: create.uri,
          author: create.author,
          cid: create.cid,
          replyTo: create.record.reply?.parent.uri,
          replyRoot: create.record.reply?.root.uri,
          indexedAt: new Date().toISOString(),
          language,
        };
      })
      .toArray();

    if (postsToCreate.length > 0) {
      indexerPostsCreated.inc(postsToCreate.length);

      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute();
    }
  }
}

function removeFacets(record: PostRecord) {
  const richText = new RichText({
    text: record.text,
    facets: record.facets,
    entities: record.entities,
  });

  for (const facet of richText.facets ?? []) {
    richText.delete(facet.index.byteStart, facet.index.byteEnd);
  }

  return richText.text.trim();
}
