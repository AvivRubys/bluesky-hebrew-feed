import events from 'events';
import { AtpAgent } from '@atproto/api';
import { createDb, migrateToLatest } from './db';
import { BlockService } from './blocks';
import { FirehoseSubscription } from './subscription';
import { Config } from './config';
import { createApi } from './api';
import { runNotifyBot } from './notify-bot';
import { filteredUsersUpdater } from './filtered-users';
import { startHealthWatchdog } from './health-watchdog';

export async function runFeedGenerator(cfg: Config): Promise<void> {
  // Create
  const db = createDb(cfg);
  const firehose = new FirehoseSubscription(
    db,
    cfg.FEEDGEN_SUBSCRIPTION_ENDPOINT,
  );
  const bsky = new AtpAgent({ service: cfg.BLUESKY_API_ENDPOINT });
  const block = new BlockService(bsky, cfg);

  const ctx = {
    db,
    cfg,
    block,
    firehose,
    bsky,
  };

  const app = createApi(ctx);

  // Run
  await migrateToLatest(db);

  void firehose.run(cfg.SUBSCRIPTION_RECONNECT_DELAY);
  const server = app.listen(cfg.PORT, cfg.HOST);

  if (ctx.cfg.BOT_ENABLED) {
    await ctx.bsky.login({
      identifier: cfg.BLUESKY_CLIENT_LOGIN_IDENTIFIER,
      password: cfg.BLUESKY_CLIENT_LOGIN_PASSWORD,
    });
    void runNotifyBot(ctx);
    void filteredUsersUpdater(bsky, db);
  }

  await events.once(server, 'listening');
  startHealthWatchdog(db, firehose);
}
