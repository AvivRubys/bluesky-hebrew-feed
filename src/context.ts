import { AtpAgent } from '@atproto/api';
import { BlockService } from './blocks';
import { Config } from './config';
import { Database } from './db';
import { FirehoseSubscription } from './subscription';
import { FilteredUsersService } from './filtered-users';

export type AppContext = {
  db: Database;
  cfg: Config;
  block: BlockService;
  firehose: FirehoseSubscription;
  bsky: AtpAgent;
  filteredUsers: FilteredUsersService;
};
