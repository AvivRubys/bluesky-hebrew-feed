import 'dotenv/config';
import FeedGenerator from './server';
import { parseEnvironment } from './config';
import logger from './logger';

async function run() {
  const config = parseEnvironment();
  const server = FeedGenerator.create(config);
  await server.start();
  logger.info(
    'Running feed generator at http://%s:%d',
    config.HOST,
    config.PORT,
  );
}

run();
