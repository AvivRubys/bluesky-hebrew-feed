import { BlockService } from './blocks';
import { Config } from './config';
import { Database } from './db';
import { FirehoseSubscription } from './subscription';

export type AppContext = {
  db: Database;
  cfg: Config;
  block: BlockService;
  firehose: FirehoseSubscription;
};
