import { Counter, Histogram } from 'prom-client';
import { BskyAgent } from '@atproto/api';
import logger from './logger';
import { Config } from './config';
import { measure } from './util/monitoring';
import { Database } from './db';
import { addMilliseconds, isBefore } from 'date-fns';

const block_fetch_cache = new Counter({
  name: 'block_fetch_cache',
  help: 'Hits/misses of blocklist fetching',
  labelNames: ['status'],
});

const block_fetch_duration = new Histogram({
  name: 'block_fetch_duration',
  help: 'Duration of bsky api calls to fetch blocklists',
  labelNames: ['status'],
});

export class BlockService {
  constructor(
    private bsky: BskyAgent,
    private db: Database,
    private config: Config,
  ) {}

  private isValid(createdAt?: Date) {
    return (
      createdAt &&
      isBefore(addMilliseconds(createdAt, this.config.CACHE_TTL_MS), Date.now())
    );
  }

  async verifyForActor(actor: string) {
    const result = await this.db
      .selectFrom('block_cache')
      .select('createdAt')
      .where('did', '=', actor)
      .executeTakeFirst();

    if (this.isValid(result?.createdAt)) {
      block_fetch_cache.inc({ status: 'hit' });
      return;
    }

    const blocks = (await this.getBlocksFromSource(actor)) ?? [];
    block_fetch_cache.inc({ status: 'miss' });
    await this.db
      .insertInto('block_cache')
      .values([{ did: actor, blockedDids: blocks }])
      .execute();
  }

  private async getBlocksFromSource(actor: string) {
    try {
      const blocks: string[] = [];
      let cursor: string | undefined = undefined;
      let lastBatchSize: number | undefined = undefined;
      do {
        const blockPage = await measure(block_fetch_duration, () =>
          this.bsky.app.bsky.graph.block.list({
            repo: actor,
            cursor,
          }),
        );
        blocks.push(...blockPage.records.map((r) => r.value.subject));

        cursor = blockPage.cursor;
        lastBatchSize = blockPage.records.length;
      } while (cursor != undefined && lastBatchSize === 50);

      return blocks;
    } catch (err) {
      logger.error(err, 'Error while fetching blocks');
      return null;
    }
  }
}
