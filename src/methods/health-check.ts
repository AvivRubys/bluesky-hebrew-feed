import { Request, Response } from 'express';
import { sql } from 'kysely';
import { differenceInSeconds, formatDistanceToNowStrict } from 'date-fns';
import { Database } from '../db';
import logger from '../logger';
import { FirehoseSubscription } from '../subscription';

export function createHealthCheckRoute(
  db: Database,
  firehose: FirehoseSubscription,
) {
  return async (_: Request, res: Response) => {
    try {
      await Promise.all([databaseCheck(db), firehoseCheck(firehose)]);
      res.status(200).send();
    } catch (err) {
      logger.warn(err, 'Health check failed');
      res.status(503).send();
    }
  };
}

async function databaseCheck(db: Database) {
  const result = await sql`SELECT 1`.execute(db);

  if (result.rows.length !== 1) {
    throw new Error(
      'Database health check failed. Unexpected query response: ' +
        JSON.stringify(result.rows),
    );
  }
}
async function firehoseCheck(firehose: FirehoseSubscription) {
  if (typeof firehose.lastEventDate === 'undefined') {
    throw new Error(
      "Firehose health check failed - firehose hasn't started yet.",
    );
  }

  if (differenceInSeconds(firehose.lastEventDate, new Date()) > 10) {
    throw new Error(
      'Firehose health check failed. Last event date is older than 10s (' +
        formatDistanceToNowStrict(firehose.lastEventDate, {
          addSuffix: true,
          unit: 'second',
        }) +
        ')',
    );
  }
}
