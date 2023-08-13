import 'dotenv/config';
import events from 'events';
import { parseEnvironment } from './config';
import logger from './logger';
import { createAppContext } from './context';
import { createApi } from './api';
import * as db from './db';

async function run() {
  const config = parseEnvironment();
  const context = createAppContext(config);
  const api = createApi(context);

  logger.info(
    'Running feed generator at http://%s:%d',
    config.HOST,
    config.PORT,
  );
  await db.migrateToLatest(context.db);
  context.firehose.run(config.SUBSCRIPTION_RECONNECT_DELAY);
  const server = api.listen(config.PORT, config.HOST);
  await events.once(server, 'listening');
}

run();
