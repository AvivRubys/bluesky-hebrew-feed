import express from 'express';
import { sql } from 'kysely';
import { differenceInSeconds, formatDistanceToNow } from 'date-fns';
import { Database } from '../db';
import logger from '../logger';
import { FirehoseSubscription } from '../subscription';
import { AppContext } from '../context';

export function healthCheckRoute(ctx: AppContext) {
  const router = express.Router();

  router.get('/.well-known/did.json', async (_, res) => {
    try {
      await Promise.all([databaseCheck(ctx.db), firehoseCheck(ctx.firehose)]);
      res.status(200).send();
    } catch (err) {
      logger.warn(err, 'Health check failed');
      res.status(503).send();
    }
  });

  return router;
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

  if (differenceInSeconds(new Date(), firehose.lastEventDate) > 10) {
    const diff = formatDistanceToNow(firehose.lastEventDate, {
      addSuffix: true,
    });
    throw new Error(
      `Firehose health check failed. Last event date is older than 10s (${diff})`,
    );
  }
}
