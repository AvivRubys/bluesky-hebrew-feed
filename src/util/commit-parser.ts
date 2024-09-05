import { Counter } from 'prom-client';
import { BlockMap, cborToLexRecord, readCar } from '@atproto/repo';
import { BlobRef } from '@atproto/lexicon';
import { ids, lexicons } from '../lexicon/lexicons';
import { Record as PostRecord } from '../lexicon/types/app/bsky/feed/post';
import { Commit } from '../lexicon/types/com/atproto/sync/subscribeRepos';
import { CID } from 'multiformats/cid';

class LazyCar {
  private car: { roots: CID[]; blocks: BlockMap } | null = null;

  constructor(private blocks: Uint8Array) {}

  async getBlock(cid: CID): Promise<Uint8Array | undefined> {
    if (this.car === null) {
      this.car = await readCar(this.blocks);
    }

    return this.car.blocks.get(cid);
  }
}

const firehose_operations = new Counter({
  name: 'firehose_operations',
  help: 'All operations seen on the firehose',
  labelNames: ['action', 'collection'],
});
export async function getOpsByType(evt: Commit): Promise<OperationsByType> {
  const car = new LazyCar(evt.blocks);
  const opsByType: OperationsByType = {
    posts: { creates: [] },
  };

  for (const op of evt.ops) {
    const uri = `at://${evt.repo}/${op.path}`;
    const [collection] = op.path.split('/');
    firehose_operations.inc({ action: op.action, collection });

    if (
      !op.cid ||
      op.action !== 'create' ||
      collection !== ids.AppBskyFeedPost
    ) {
      continue;
    }

    const recordBytes = await car.getBlock(op.cid);
    if (!recordBytes) {
      continue;
    }

    const record = cborToLexRecord(recordBytes);
    if (isPost(record)) {
      opsByType.posts.creates.push({
        record,
        uri,
        cid: op.cid.toString(),
        author: evt.repo,
      });
    }
  }

  return opsByType;
}

type OperationsByType = {
  posts: Operations<PostRecord>;
};

type Operations<T = Record<string, unknown>> = {
  creates: CreateOp<T>[];
};

type CreateOp<T> = {
  uri: string;
  cid: string;
  author: string;
  record: T;
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
