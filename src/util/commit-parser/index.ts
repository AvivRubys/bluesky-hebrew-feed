import { Pool, spawn, TransferDescriptor, Worker } from 'threads';
import { Commit } from '../../lexicon/types/com/atproto/sync/subscribeRepos';
import { OperationsByType } from './worker';
import { MaybeTransferable, serializeCommit, ThinCommit } from './serde';

const pool = Pool(
  () =>
    spawn<{
      getOpsByType: (
        payload: MaybeTransferable<ThinCommit>,
      ) => Promise<OperationsByType>;
    }>(new Worker('./worker')),
  10,
);

export async function getOpsByType(commit: Commit): Promise<OperationsByType> {
  const result = await pool.queue((worker) => {
    const serialized = serializeCommit(commit);
    return worker.getOpsByType(serialized);
  });
  return result;
}
