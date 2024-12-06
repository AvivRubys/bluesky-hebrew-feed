import AtpAgent from '@atproto/api';
import logger from './logger';
import { Database } from './db';
import { interval } from 'ix/asynciterable';
import { minutesToMilliseconds } from 'date-fns';

const FILTERED_USERS_BY_REQUEST_POST =
  'at://did:plc:ioo5uzicjxs5i6nfpjcxbugg/app.bsky.feed.post/3lbf7z7lb6c2x';

const UPDATE_INTERVAL_MINUTES = minutesToMilliseconds(5);

export async function filteredUsersUpdater(bsky: AtpAgent, db: Database) {
  logger.info('Starting filtered users updater');

  await updateFilteredUsers(bsky, db);
  for await (const _ of interval(UPDATE_INTERVAL_MINUTES)) {
    await updateFilteredUsers(bsky, db);
  }
}

async function updateFilteredUsers(bsky: AtpAgent, db: Database) {
  logger.info('Updating filtered users');

  const users = await fetchFilteredUsers(bsky);
  logger.info({ users }, 'Fetched filtered users');

  await db.transaction().execute(async (tx) => {
    await tx.deleteFrom('filtered_users').execute();

    await tx
      .insertInto('filtered_users')
      .values(users.map((did) => ({ did })))
      .execute();
  });

  logger.info('Finished updating filtered users');
}

async function fetchFilteredUsers(bsky: AtpAgent): Promise<readonly string[]> {
  let cursor: string | undefined = undefined;

  const users: string[] = [];
  do {
    const response = await bsky.getLikes({
      uri: FILTERED_USERS_BY_REQUEST_POST,
    });
    users.push(...response.data.likes.map((like) => like.actor.did));
    cursor = response.data.cursor;
  } while (cursor !== undefined);

  return users;
}
