import { cborToLexRecord, readCar } from '@atproto/repo';
import { BlobRef } from '@atproto/lexicon';
import { ids, lexicons } from '../../lexicon/lexicons';
import { Record as PostRecord } from '../../lexicon/types/app/bsky/feed/post';
import { expose, Transfer } from 'threads';
import { isMainThread } from 'worker_threads';
import { MaybeTransferable, repopulateCommit, ThinCommit } from './serde';

export async function getOpsByType(
  commit: ThinCommit,
): Promise<MaybeTransferable<OperationsByType>> {
  repopulateCommit(commit);

  const car = await readCar(commit.blocks);
  const opsByType: OperationsByType = {
    posts: { creates: [], deletes: [] },
  };

  for (const op of commit.ops) {
    const uri = `at://${commit.repo}/${op.path}`;
    const [collection] = op.path.split('/');

    if (op.action === 'update') continue; // updates not supported yet

    if (op.action === 'create') {
      if (!op.cid) continue;
      const recordBytes = car.blocks.get(op.cid);
      if (!recordBytes) continue;
      const record = cborToLexRecord(recordBytes);
      const create = { uri, cid: op.cid.toString(), author: commit.repo };
      if (collection === ids.AppBskyFeedPost && isPost(record)) {
        delete record.embed;
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
}

if (!isMainThread) {
  expose({ getOpsByType });
}

export type OperationsByType = {
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

const isPost = (obj: unknown): obj is PostRecord => {
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
