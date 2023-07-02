import 'dotenv/config';
import FeedGenerator from './server';
import { parseEnvironment } from './config';

async function run() {
  const config = parseEnvironment();
  const server = FeedGenerator.create(config);
  await server.start();
  console.log(
    `🤖 running feed generator at http://${config.FEEDGEN_LISTENHOST}:${config.FEEDGEN_PORT}`,
  );
}

run();
