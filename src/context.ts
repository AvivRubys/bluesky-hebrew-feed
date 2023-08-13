import { BskyAgent } from '@atproto/api';
import { BlockService } from './blocks';
import { Config } from './config';
import { Database, createDb } from './db';
import { FirehoseSubscription } from './subscription';

export type AppContext = {
  db: Database;
  cfg: Config;
  block: BlockService;
  firehose: FirehoseSubscription;
  bsky: BskyAgent;
};

export function createAppContext(cfg: Config): AppContext {
  const db = createDb(cfg);
  const firehose = new FirehoseSubscription(
    db,
    cfg.FEEDGEN_SUBSCRIPTION_ENDPOINT,
  );
  const bsky = new BskyAgent({ service: cfg.BLUESKY_API_ENDPOINT });
  const block = new BlockService(bsky, cfg);

  return {
    db,
    cfg,
    block,
    firehose,
    bsky,
  };
}
