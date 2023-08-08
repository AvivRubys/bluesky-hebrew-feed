import { BskyAgent } from '@atproto/api';
import { LRUCache } from 'lru-cache';
import { minutesToMilliseconds } from 'date-fns';
import logger from './logger';

export class BlockService {
  #cache: LRUCache<string, string[]>;
  #bsky: BskyAgent;

  constructor() {
    this.#cache = new LRUCache<string, string[]>({
      max: 1000,
      ttl: minutesToMilliseconds(10),
    });
    this.#bsky = new BskyAgent({ service: 'https://bsky.social' });
  }

  async getBlocksFor(actor: string) {
    if (this.#cache.has(actor)) {
      return this.#cache.get(actor);
    }

    const blocks = await this.getBlocksFromSource(actor);
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
        const blockPage = await this.#bsky.app.bsky.graph.block.list({
          repo: actor,
          cursor,
        });
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
