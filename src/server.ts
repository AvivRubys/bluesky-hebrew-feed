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
import logger from './logger';

export async function runFeedGenerator(cfg: Config): Promise<void> {
  const db = createDb(cfg);
  const abortController = new AbortController();
  const firehose = new FirehoseSubscription(
    db,
    cfg.FEEDGEN_SUBSCRIPTION_ENDPOINT,
    abortController.signal,
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

  await migrateToLatest(db);

  void firehose.run(cfg.SUBSCRIPTION_RECONNECT_DELAY);
  const server = app.listen(cfg.PORT, cfg.HOST);

  if (ctx.cfg.BOT_ENABLED || ctx.cfg.FILTERED_USERS_UPDATER) {
    await ctx.bsky.login({
      identifier: cfg.BLUESKY_CLIENT_LOGIN_IDENTIFIER,
      password: cfg.BLUESKY_CLIENT_LOGIN_PASSWORD,
    });

    if (ctx.cfg.BOT_ENABLED) {
      void runNotifyBot(ctx);
    }

    if (ctx.cfg.FILTERED_USERS_UPDATER) {
      void filteredUsersUpdater(bsky, db);
    }
  }

  await events.once(server, 'listening');
  startHealthWatchdog(db, firehose);

  const shutdown = async () => {
    logger.info('Shutting down...');
    server.close();
    abortController.abort();
    try {
      await db.destroy();
    } catch (err) {
      logger.error(err, 'Error closing database');
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
