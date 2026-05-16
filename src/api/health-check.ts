import { Request, Response } from 'express';
import { Database } from '../db';
import logger from '../logger';
import { FirehoseSubscription } from '../subscription';
import { checkHealth } from '../health-watchdog';

export function createHealthCheckRoute(
  db: Database,
  firehose: FirehoseSubscription,
) {
  return async (_: Request, res: Response) => {
    try {
      await checkHealth(db, firehose)
      res.status(200).send();
    } catch (err) {
      logger.warn(err, 'Health check failed');
      res.status(503).send();
    }
  };
}
