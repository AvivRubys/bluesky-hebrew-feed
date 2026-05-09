import { setTimeout } from 'timers/promises';
import { interval } from 'ix/asynciterable';
import { Database } from './db';
import { FirehoseSubscription } from './subscription';
import { checkDatabase, checkFirehose } from './api/health-check';
import logger from './logger';

const maxFailures = 3;
const CHECK_INTERVAL_MS = 30_000;
const GRACE_PERIOD_MS = 300_000;

export async function startHealthWatchdog(
  db: Database,
  firehose: FirehoseSubscription,
): Promise<void> {
  let consecutiveFailures = 0;

  await setTimeout(GRACE_PERIOD_MS);

  for await (const _ of interval(CHECK_INTERVAL_MS)) {
    try {
      await Promise.all([checkDatabase(db), checkFirehose(firehose)]);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      logger.warn(err, `Health check failed (${consecutiveFailures}/${maxFailures})`);
      if (consecutiveFailures >= maxFailures) {
        logger.error('Exiting after 3 consecutive health check failures');
        process.exit(1);
      }
    }
  }
}
