import { Transfer, TransferDescriptor } from 'threads';
import {
  Commit,
  RepoOp,
} from '../../lexicon/types/com/atproto/sync/subscribeRepos';
import { CID } from 'multiformats/cid';

export type MaybeTransferable<T> = T | TransferDescriptor<T>;

export interface ThinRepoOp {
  action: RepoOp['action'];
  path: RepoOp['path'];
  cidRaw?: string;
  cid?: CID;
}
export interface ThinCommit {
  blocks: Uint8Array;
  repo: string;
  ops: ThinRepoOp[];
}

// This exists for two reasons:
//  1. To ensure we set blocks as transferable, for performance
//  2. CID class gets mangled during postMessage, so this serializes and deserialized it properly
export function serializeCommit(commit: Commit): MaybeTransferable<ThinCommit> {
  return {
    blocks: commit.blocks,
    repo: commit.repo,
    ops: commit.ops.map((op) => ({
      action: op.action,
      path: op.path,
      cidRaw: op.cid?.toString(),
    })),
  };
}

export function repopulateCommit(commit: ThinCommit) {
  for (const op of commit.ops) {
    if (op.cidRaw) {
      op.cid = CID.parse(op.cidRaw);
    }
  }
}
