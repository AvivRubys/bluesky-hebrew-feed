import util from 'util';
import { exec } from 'child_process';
import 'dotenv/config';
import { setTimeout } from 'timers/promises';
const execAsync = util.promisify(exec);

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ?? '8080';

async function healthcheck() {
  try {
    const url = `http://${host}:${port}/health`;
    console.log('Healthchecking url', url);
    const result = await fetch(url);
    console.log('Response from healthcheck status', result.status);

    return result.status === 200;
  } catch (err) {
    console.error('Something has gone wrong in health checking', err);
    return false;
  }
}

async function restartServer() {
  const { stdout, stderr } = await execAsync('pm2 restart bluesky-feeds');
  console.log('Ran restart');
  console.log('Output: ', stdout);
  console.log('Error: ', stderr);
}

async function run() {
  let lastResult = true;
  while (true) {
    await setTimeout(30_000);
    const result = await healthcheck();
    if (!lastResult && !result) {
      await restartServer();
      lastResult = true;
      await setTimeout(60_000);
    } else {
      lastResult = result;
    }
  }
}

run();
