import http from 'http';
import events from 'events';
import express from 'express';
import morgan from 'morgan';
import { createServer } from './lexicon';
import feedGeneration from './methods/feed-generation';
import describeGenerator from './methods/describe-generator';
import { createDb, Database, migrateToLatest } from './db';
import { FirehoseSubscription } from './subscription';
import { AppContext, Config } from './config';
import wellKnown from './well-known';

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
    const app = express();
    app.use(morgan('combined'));
    const db = createDb(cfg.POSTGRES_CONNECTION_STRING);
    const firehose = new FirehoseSubscription(
      db,
      cfg.FEEDGEN_SUBSCRIPTION_ENDPOINT,
    );

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024, // 5mb
      },
    });
    const ctx: AppContext = {
      db,
      cfg,
    };
    feedGeneration(server, ctx);
    describeGenerator(server, ctx);
    app.use(server.xrpc.router);
    app.use(wellKnown(ctx));

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
