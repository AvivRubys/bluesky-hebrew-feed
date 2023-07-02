import http from 'http';
import events from 'events';
import express from 'express';
import { DidResolver, MemoryCache } from '@atproto/did-resolver';
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
    const db = createDb(cfg.FEEDGEN_SQLITE_LOCATION);
    const firehose = new FirehoseSubscription(
      db,
      cfg.FEEDGEN_SUBSCRIPTION_ENDPOINT,
    );

    const didCache = new MemoryCache();
    const didResolver = new DidResolver(
      { plcUrl: 'https://plc.directory' },
      didCache,
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
      didResolver,
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
    this.firehose.run(this.cfg.FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY);
    this.server = this.app.listen(
      this.cfg.FEEDGEN_PORT,
      this.cfg.FEEDGEN_LISTENHOST,
    );
    await events.once(this.server, 'listening');
    return this.server;
  }
}

export default FeedGenerator;
