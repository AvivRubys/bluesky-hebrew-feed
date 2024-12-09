import util from 'util';
import { exec } from 'child_process';
import 'dotenv/config';
import { setTimeout } from 'timers/promises';
const execAsync = util.promisify(exec);

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ?? '8080';
const checkInterval = 30_000;
const restartGracePeriod = 300_000;

type Logger = typeof console.log;
const addTimestamp =
  (fn: Logger) =>
  (...[message, ...args]: Parameters<Logger>) =>
    fn(`${new Date().toISOString()} | ${message}`, ...args);

const logger = {
  log: addTimestamp(console.log),
  warn: addTimestamp(console.warn),
  error: addTimestamp(console.error),
};

async function healthcheck() {
  try {
    const url = `http://${host}:${port}/health`;
    logger.log('Healthchecking url', url);
    const result = await fetch(url);
    logger.log('Response from healthcheck status', result.status);

    return result.status === 200;
  } catch (err) {
    logger.error('Something has gone wrong in health checking', err);
    return false;
  }
}

async function restartServer() {
  logger.warn('Restarting server');
  const { stdout, stderr } = await execAsync('pm2 restart bluesky-feeds');
  logger.warn('Output: ', stdout);
  logger.warn('Error: ', stderr);
}

async function run() {
  let lastResult = true;
  while (true) {
    await setTimeout(checkInterval);
    const result = await healthcheck();
    if (!lastResult && !result) {
      await restartServer();
      lastResult = true;
      await setTimeout(restartGracePeriod);
    } else {
      lastResult = result;
    }
  }
}

run();
