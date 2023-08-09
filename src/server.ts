import http from 'http';
import events from 'events';
import express from 'express';
import { createDb, Database, migrateToLatest } from './db';
import { BlockService } from './blocks';
import { FirehoseSubscription } from './subscription';
import { Config } from './config';
import { createApi } from './api';

export class FeedGenerator {
  public server?: http.Server;

  constructor(
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

    const ctx = {
      db,
      cfg,
      block: new BlockService(),
      firehose,
    };

    const app = createApi(ctx);

    return new FeedGenerator(app, db, firehose, cfg);
  }

  async start(): Promise<http.Server> {
    await migrateToLatest(this.db);
    this.firehose.run(this.cfg.SUBSCRIPTION_RECONNECT_DELAY);
    this.server = this.app.listen(this.cfg.PORT, this.cfg.HOST);
    await events.once(this.server, 'listening');
    return this.server;
  }
}

export default FeedGenerator;
