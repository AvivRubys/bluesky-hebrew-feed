import AtpAgent from '@atproto/api';
import logger from './logger';
import { Database } from './db';
import { interval } from 'ix/asynciterable';
import { minutesToMilliseconds } from 'date-fns';

const FILTERED_USERS_BY_REQUEST_POST =
  'at://did:plc:ioo5uzicjxs5i6nfpjcxbugg/app.bsky.feed.post/3lbf7z7lb6c2x';

const FILTERED_USERS_LISTS = [
  'at://did:plc:63fijvrra4pxxj34obunxp6f/app.bsky.graph.list/3lgeadj4f4l26',
];

const UPDATE_INTERVAL_MINUTES = minutesToMilliseconds(10);

export async function filteredUsersUpdater(bsky: AtpAgent, db: Database) {
  logger.info('Starting filtered users updater');

  await updateFilteredUsers(bsky, db);
  for await (const _ of interval(UPDATE_INTERVAL_MINUTES)) {
    try {
      await updateFilteredUsers(bsky, db);
    } catch (err: unknown) {
      logger.error({ err }, 'Failed updating filtered users list');
    }
  }
}

async function updateFilteredUsers(bsky: AtpAgent, db: Database) {
  logger.info('Updating filtered users');

  const users: string[] = [];

  const selfFilteredUsers = await fetchSelfFilteredUsers(bsky);
  logger.info({ users: selfFilteredUsers }, 'Fetched self filtered users');
  users.concat(selfFilteredUsers);

  for (const filterList of FILTERED_USERS_LISTS) {
    const filteredUsers = await fetchFilteredUsersList(bsky, filterList);
    logger.info({ users, filterList }, 'Fetched filtered users from list');
    users.concat(filteredUsers);
  }

  const uniqueUsers = [...new Set(users)];

  await db.transaction().execute(async (tx) => {
    await tx.deleteFrom('filtered_users').execute();

    await tx
      .insertInto('filtered_users')
      .values(uniqueUsers.map((did) => ({ did })))
      .execute();
  });

  logger.info('Finished updating filtered users');
}

async function fetchSelfFilteredUsers(bsky: AtpAgent): Promise<string[]> {
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

async function fetchFilteredUsersList(
  bsky: AtpAgent,
  list: string,
): Promise<string[]> {
  let cursor: string | undefined = undefined;

  const users: string[] = [];
  do {
    const response = await bsky.app.bsky.graph.getList({
      list,
    });
    users.push(...response.data.items.map((item) => item.subject.did));
    cursor = response.data.cursor;
  } while (cursor !== undefined);

  return users;
}
