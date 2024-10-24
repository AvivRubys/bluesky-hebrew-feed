import http from 'http';
import events from 'events';
import express from 'express';
import { AtpAgent } from '@atproto/api';
import { createDb, Database, migrateToLatest } from './db';
import { BlockService } from './blocks';
import { FirehoseSubscription } from './subscription';
import { Config } from './config';
import { createApi } from './api';
import { AppContext } from './context';
import { runNotifyBot } from './notify-bot';

export class FeedGenerator {
  public server?: http.Server;

  constructor(
    private ctx: AppContext,
    private app: express.Application,
    private db: Database,
    private firehose: FirehoseSubscription,
    private cfg: Config,
  ) {
    this.app = app;
    this.db = db;
    this.firehose = firehose;
    this.cfg = cfg;
  }

  static create(cfg: Config) {
    const db = createDb(cfg);
    const firehose = new FirehoseSubscription(
      db,
      cfg.FEEDGEN_SUBSCRIPTION_ENDPOINT,
    );
    const bsky = new AtpAgent({ service: cfg.BLUESKY_API_ENDPOINT });
    const block = new BlockService(bsky, cfg);

    const ctx: AppContext = {
      db,
      cfg,
      block,
      firehose,
      bsky,
    };

    const app = createApi(ctx);

    return new FeedGenerator(ctx, app, db, firehose, cfg);
  }

  async loginToBskyAgent() {
    await this.ctx.bsky.login({
      identifier: this.ctx.cfg.BLUESKY_CLIENT_LOGIN_IDENTIFIER,
      password: this.ctx.cfg.BLUESKY_CLIENT_LOGIN_PASSWORD,
    });
  }

  async start() {
    await migrateToLatest(this.db);
    await this.loginToBskyAgent();

    this.firehose.run(this.cfg.SUBSCRIPTION_RECONNECT_DELAY);
    this.server = this.app.listen(this.cfg.PORT, this.cfg.HOST);
    runNotifyBot(this.ctx);
    await events.once(this.server, 'listening');
    return this.server;
  }
}

export default FeedGenerator;
