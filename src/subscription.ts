import { AsyncIterable } from 'ix';
import { RichText } from '@atproto/api';
import { Counter } from 'prom-client';
import { Commit } from './lexicon/types/com/atproto/sync/subscribeRepos';
import { FirehoseSubscriptionBase } from './util/subscription';
import { extractTextLanguage, hasHebrewLetters } from './util/hebrew';
import { Record as PostRecord } from './lexicon/types/app/bsky/feed/post';
import { getOpsByType } from './util/commit-parser';
import { min } from 'date-fns';
import logger from './logger';

const indexerPostsCreated = new Counter({
  name: 'indexer_posts_created',
  help: 'Posts indexed',
});

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleCommits(commits: Commit[]) {
    const ops = await Promise.all(commits.map(getOpsByType));
    const postsToCreate = await AsyncIterable.from(ops)
      .flatMap((op) => op.posts.creates)
      .filter((op) => hasHebrewLetters(op.record.text))
      .map(async (create) => {
        const language = await extractTextLanguage(removeFacets(create.record));
        const indexedAt = new Date();
        const createdAt = create.record.createdAt;
        const effectiveTimestamp = min([indexedAt, createdAt]).toISOString();
        logger.info({uri: create.uri, text: create.record.text, effectiveTimestamp}, "Indexing new post")

        return {
          uri: create.uri,
          author: create.author,
          cid: create.cid,
          replyTo: create.record.reply?.parent.uri,
          replyRoot: create.record.reply?.root.uri,
          indexedAt: indexedAt.toISOString(),
          createdAt: create.record.createdAt,
          effectiveTimestamp,
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
