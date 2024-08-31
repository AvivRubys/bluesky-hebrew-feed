import { differenceInMilliseconds } from 'date-fns';
import { Counter, Gauge, Histogram } from 'prom-client';
import { AsyncIterable } from 'ix';
import { interval } from 'ix/asynciterable';
import { bufferCountOrTime, filter } from 'ix/asynciterable/operators';
import { Subscription } from '@atproto/xrpc-server';
import { cborToLexRecord, readCar } from '@atproto/repo';
import { BlobRef } from '@atproto/lexicon';
import { ids, lexicons } from '../lexicon/lexicons';
import { Record as PostRecord } from '../lexicon/types/app/bsky/feed/post';
import {
  Commit,
  OutputSchema as RepoEvent,
  isCommit,
} from '../lexicon/types/com/atproto/sync/subscribeRepos';
import { Database } from '../db';
import logger from '../logger';
import { bufferTime } from './buffer-time';

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
  buckets: [100, 250, 500, 1000, 2000, 5000],
});

export abstract class FirehoseSubscriptionBase {
  public sub: Subscription<RepoEvent>;
  public lastEventDate?: Date;

  constructor(public db: Database, public service: string) {
    this.sub = new Subscription({
      service: service,
      method: ids.ComAtprotoSyncSubscribeRepos,
      getParams: () => this.getCursor(),
      validate: (value: unknown) => {
        try {
          return lexicons.assertValidXrpcMessage<RepoEvent>(
            ids.ComAtprotoSyncSubscribeRepos,
            value,
          );
        } catch (err) {
          console.error('repo subscription skipped invalid message', err);
        }
      },
    });
  }

  abstract handleCommits(commits: Commit[]): Promise<void>;

  async processSubscription() {
    logger.info('Starting repo subscription...');

    for await (const commits of AsyncIterable.from(this.sub).pipe(
      filter(isCommit),
      bufferCountOrTime(2000, 10000),
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
      .set({ cursor })
      .where('service', '=', this.service)
      .executeTakeFirst();

    if (result.numUpdatedRows === 0n) {
      logger.info('Updating sub_state changed no rows, upserting instead');

      await this.db
        .insertInto('sub_state')
        .values({ service: this.service, cursor })
        .onConflict((oc) =>
          oc
            .column('service')
            .doUpdateSet({ cursor: (eb) => eb.ref('excluded.cursor') }),
        )
        .execute();
    }
  }

  async getCursor(): Promise<{ cursor?: number }> {
    const res = await this.db
      .selectFrom('sub_state')
      .selectAll()
      .where('service', '=', this.service)
      .executeTakeFirst();
    return res ? { cursor: res.cursor } : {};
  }
}

const firehose_operations = new Counter({
  name: 'firehose_operations',
  help: 'All operations seen on the firehose',
  labelNames: ['action', 'collection'],
});
export const getOpsByType = async (evt: Commit): Promise<OperationsByType> => {
  const car = await readCar(evt.blocks);
  const opsByType: OperationsByType = {
    posts: { creates: [], deletes: [] },
  };

  for (const op of evt.ops) {
    const uri = `at://${evt.repo}/${op.path}`;
    const [collection] = op.path.split('/');
    firehose_operations.inc({ action: op.action, collection });

    if (op.action === 'update') continue; // updates not supported yet

    if (op.action === 'create') {
      if (!op.cid) continue;
      const recordBytes = car.blocks.get(op.cid);
      if (!recordBytes) continue;
      const record = cborToLexRecord(recordBytes);
      const create = { uri, cid: op.cid.toString(), author: evt.repo };
      if (collection === ids.AppBskyFeedPost && isPost(record)) {
        opsByType.posts.creates.push({ record, ...create });
      }
    }

    if (op.action === 'delete') {
      if (collection === ids.AppBskyFeedPost) {
        opsByType.posts.deletes.push({ uri });
      }
    }
  }

  return opsByType;
};

type OperationsByType = {
  posts: Operations<PostRecord>;
};

type Operations<T = Record<string, unknown>> = {
  creates: CreateOp<T>[];
  deletes: DeleteOp[];
};

type CreateOp<T> = {
  uri: string;
  cid: string;
  author: string;
  record: T;
};

type DeleteOp = {
  uri: string;
};

export const isPost = (obj: unknown): obj is PostRecord => {
  return isType(obj, ids.AppBskyFeedPost);
};

const isType = (obj: unknown, nsid: string) => {
  try {
    lexicons.assertValidRecord(nsid, fixBlobRefs(obj));
    return true;
  } catch (err) {
    return false;
  }
};

// @TODO right now record validation fails on BlobRefs
// simply because multiple packages have their own copy
// of the BlobRef class, causing instanceof checks to fail.
// This is a temporary solution.
const fixBlobRefs = (obj: unknown): unknown => {
  if (Array.isArray(obj)) {
    return obj.map(fixBlobRefs);
  }
  if (obj && typeof obj === 'object') {
    if (obj.constructor.name === 'BlobRef') {
      const blob = obj as BlobRef;
      return new BlobRef(blob.ref, blob.mimeType, blob.size, blob.original);
    }
    return Object.entries(obj).reduce((acc, [key, val]) => {
      return Object.assign(acc, { [key]: fixBlobRefs(val) });
    }, {} as Record<string, unknown>);
  }
  return obj;
};
