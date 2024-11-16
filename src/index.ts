import 'dotenv/config';
import { runFeedGenerator } from './server';
import { parseEnvironment } from './config';
import logger from './logger';

async function run() {
  const config = parseEnvironment();
  await runFeedGenerator(config);
  logger.info(
    'Running feed generator at http://%s:%d',
    config.HOST,
    config.PORT,
  );
}

run();
