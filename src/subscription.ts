import { AsyncIterable } from 'ix';
import { Counter } from 'prom-client';
import { Commit } from './lexicon/types/com/atproto/sync/subscribeRepos';
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription';
import { hasHebrewLetters } from './util/hebrew';
import { Worker } from 'node:worker_threads';

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

    await AsyncIterable.from(ops)
      .flatMap((op) => op.posts.creates)
      .filter((op) => hasHebrewLetters(op.record.text))
      .map(async (create) => {
        const worker = new Worker('./worker-parse.ts', { workerData: create });

        worker.on('message', (result) => {
          this.db
            .insertInto('post')
            .values(result)
            .onConflict((oc) => oc.doNothing())
            .execute();
        });

        worker.on('error', (error) => {
          console.error('Worker error:', error);
        });
      });
  }
}
