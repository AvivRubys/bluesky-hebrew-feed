import logger from '../logger';

type BackgroundTask = () => Promise<void>;

const taskQueue: BackgroundTask[] = [];

export function run(name: string, fn: BackgroundTask) {
  fn().catch((err) =>
    logger.error({ err, name }, 'Error running background task'),
  );
}
