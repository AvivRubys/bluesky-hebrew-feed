import { Counter, Histogram } from 'prom-client';
import { BskyAgent } from '@atproto/api';
import { LRUCache } from 'lru-cache';
import logger from './logger';
import { Config } from './config';
import { measure } from './util/monitoring';

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
  #cache: LRUCache<string, string[]>;

  constructor(private bsky: BskyAgent, config: Config) {
    this.#cache = new LRUCache<string, string[]>({
      max: 1000,
      ttl: config.CACHE_TTL_MS,
    });
  }

  async getBlocksFor(actor: string) {
    if (this.#cache.has(actor)) {
      block_fetch_cache.inc({ status: 'miss' });
      return this.#cache.get(actor);
    }

    const blocks = await this.getBlocksFromSource(actor);
    block_fetch_cache.inc({ status: 'hit' });
    if (blocks === null) {
      return [];
    }

    this.#cache.set(actor, blocks);

    return blocks;
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