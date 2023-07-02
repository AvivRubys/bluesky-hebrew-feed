import { formatDistanceToNowStrict } from 'date-fns';
import { sql } from 'kysely';
import { AsyncIterable } from 'ix';
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

export abstract class FirehoseSubscriptionBase {
  public sub: Subscription<RepoEvent>;

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

  async handleCommitsSafe(commits: Commit[]): Promise<void> {
    try {
      await this.handleCommits(commits);
    } catch (err) {
      logger.error(err, 'repo subscription could not handle message');
    }
  }

  async run(subscriptionReconnectDelay: number) {
    try {
      for await (const commits of AsyncIterable.from(this.sub)
        .filter(isCommit)
        .buffer(200)) {
        await this.handleCommitsSafe(commits);

        const lastEvent = commits[commits.length - 1];
        logger.info(
          'Handled %d commits from %s',
          commits.length,
          formatDistanceToNowStrict(new Date(lastEvent.time), {
            addSuffix: true,
            unit: 'minute',
          }),
        );
        await this.updateCursor(lastEvent.seq);
      }
    } catch (err) {
      logger.error(err, 'repo subscription errored');
      setTimeout(
        () => this.run(subscriptionReconnectDelay),
        subscriptionReconnectDelay,
      );
    }
  }

  async updateCursor(cursor: number) {
    const statement = sql`INSERT INTO sub_state (service, cursor)
VALUES (${this.service}, ${cursor})
ON CONFLICT (service)
DO UPDATE SET cursor = EXCLUDED.cursor;`;

    await statement.execute(this.db);
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

export const getOpsByType = async (evt: Commit): Promise<OperationsByType> => {
  const car = await readCar(evt.blocks);
  const opsByType: OperationsByType = {
    posts: { creates: [], deletes: [] },
  };

  for (const op of evt.ops) {
    const uri = `at://${evt.repo}/${op.path}`;
    const [collection] = op.path.split('/');

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
