import { setTimeout } from 'timers/promises';
import { sql } from 'kysely';
import { differenceInSeconds, formatDistanceToNow } from 'date-fns';
import { interval } from 'ix/asynciterable';
import { Database } from './db';
import { FirehoseSubscription } from './subscription';
import logger from './logger';

const MAX_FAILURES = 3;
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
      await checkHealth(db, firehose)
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      logger.warn(err, `Health check failed (${consecutiveFailures}/${MAX_FAILURES})`);
      if (consecutiveFailures >= MAX_FAILURES) {
        logger.error('Exiting after 3 consecutive health check failures');
        process.exit(1);
      }
    }
  }
}

export async function checkHealth(db: Database, firehose: FirehoseSubscription) {
  await Promise.all([checkDatabase(db), checkFirehose(firehose)]);
}

async function checkDatabase(db: Database) {
  const result = await sql`SELECT 1`.execute(db);

  if (result.rows.length !== 1) {
    throw new Error(
      'Database health check failed. Unexpected query response: ' +
        JSON.stringify(result.rows),
    );
  }
}

const FIREHOSE_LATENESS_THRESHOLD_SECONDS = 30
async function checkFirehose(firehose: FirehoseSubscription) {
  if (typeof firehose.lastEventDate === 'undefined') {
    throw new Error(
      "Firehose health check failed - firehose hasn't started yet.",
    );
  }

  if (differenceInSeconds(new Date(), firehose.lastEventDate) > FIREHOSE_LATENESS_THRESHOLD_SECONDS) {
    const diff = formatDistanceToNow(firehose.lastEventDate, {
      addSuffix: true,
    });
    throw new Error(
      `Firehose health check failed. Last event date is ${diff} old (threshold - ${FIREHOSE_LATENESS_THRESHOLD_SECONDS}s)`,
    );
  }
}
