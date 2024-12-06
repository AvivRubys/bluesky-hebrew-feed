import { differenceInMilliseconds } from 'date-fns';
import { Counter, Gauge, Histogram } from 'prom-client';
import { AsyncIterable } from 'ix';
import { interval } from 'ix/asynciterable';
import { bufferCountOrTime, filter } from 'ix/asynciterable/operators';
import { Subscription } from '@atproto/xrpc-server';
import { ids, lexicons } from '../lexicon/lexicons';
import {
  Commit,
  OutputSchema as RepoEvent,
  isCommit,
} from '../lexicon/types/com/atproto/sync/subscribeRepos';
import { Database } from '../db';
import logger from '../logger';
import { ValidationError } from '@atproto/lexicon';

const commits_handled = new Counter({
  name: 'indexer_commits_handled',
  help: 'Number of commits received and handled',
});

const commit_lag = new Gauge({
  name: 'indexer_commit_lag',
  help: 'Indexer firehose handling lag',
});

const handle_commits_histogram = new Histogram({
  name: 'handle_commit',
  help: 'Handle commit phase',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000],
});

export abstract class FirehoseSubscriptionBase {
  public sub: Subscription<RepoEvent>;
  public lastEventDate?: Date;

  constructor(public db: Database, public service: string) {
    this.sub = new Subscription({
      service: service,
      method: ids.ComAtprotoSyncSubscribeRepos,
      getParams: () => this.getCursor(),
      onReconnectError: (error: unknown, n: number, initialSetup: boolean) => {
        console.error('onReconnectError', error, n, initialSetup);
      },
      validate: (value: unknown) => {
        try {
          return lexicons.assertValidXrpcMessage<RepoEvent>(
            ids.ComAtprotoSyncSubscribeRepos,
            value,
          );
        } catch (err) {
          if (
            !(
              err instanceof ValidationError &&
              err.message === 'Message must have the property "blocks"'
            )
          ) {
            console.error('repo subscription skipped invalid message', err);
          }
        }
      },
    });
  }

  abstract handleCommits(commits: Commit[]): Promise<void>;

  async processSubscription() {
    logger.info('Starting repo subscription...');

    for await (const commits of AsyncIterable.from(this.sub).pipe(
      filter(isCommit),
      bufferCountOrTime(2000, 50000),
    )) {
      if (commits.length === 0) {
        continue;
      }

      const endTimer = handle_commits_histogram.startTimer();
      try {
        await this.handleCommits(commits);
      } catch (err) {
        logger.error(err, 'repo subscription could not handle message');
      }
      endTimer();

      const lastEvent = commits.at(-1)!;
      this.lastEventDate = new Date(lastEvent.time);
      commits_handled.inc(commits.length);
      commit_lag.set(differenceInMilliseconds(new Date(), this.lastEventDate));
      await this.updateCursor(lastEvent.seq);
    }
  }

  async run(subscriptionReconnectDelay: number) {
    for await (const _ of interval(subscriptionReconnectDelay)) {
      try {
        await this.processSubscription();
      } catch (err) {
        logger.error(err, 'repo subscription errored');
      }
    }
  }

  async updateCursor(cursor: number) {
    const result = await this.db
      .updateTable('sub_state')
      .set({ cursor: cursor.toString() })
      .where('service', '=', this.service)
      .executeTakeFirst();

    if (result.numUpdatedRows === 0n) {
      logger.info('Updating sub_state changed no rows, upserting instead');

      await this.db
        .insertInto('sub_state')
        .values({ service: this.service, cursor: cursor.toString() })
        .onConflict((oc) =>
          oc
            .column('service')
            .doUpdateSet({ cursor: (eb) => eb.ref('excluded.cursor') }),
        )
        .execute();
    }
  }

  async getCursor(): Promise<{ cursor?: string }> {
    const res = await this.db
      .selectFrom('sub_state')
      .selectAll()
      .where('service', '=', this.service)
      .executeTakeFirst();

    logger.info('Starting subscription from cursor=%d', res?.cursor);
    return res ? { cursor: res.cursor } : {};
  }
}
