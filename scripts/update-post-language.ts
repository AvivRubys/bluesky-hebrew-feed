import 'dotenv/config';
import { createDb } from '../src/db';
import { parseEnvironment } from '../src/config';
import { BskyAgent } from '@atproto/api';
import { extractTextLanguage } from '../src/util/hebrew';
import logger from '../src/logger';

(async () => {
  logger.level = 'error';

  const config = parseEnvironment();
  const db = createDb(config.POSTGRES_CONNECTION_STRING);
  const api = new BskyAgent({ service: 'https://bsky.social' });

  const posts = await db
    .selectFrom('post')
    .select(['uri'])
    .orderBy('indexedAt', 'desc')
    .execute();
  for (const post of posts) {
    const [, repo, rkey] = Array.from(
      post.uri.matchAll(/at:\/\/(.*)\/app.bsky.feed.post\/(.*)/g),
    )[0];
    try {
      const resp = await api.getPost({ repo, rkey });
      const language = await extractTextLanguage(resp.value.text);
      await db
        .updateTable('post')
        .set({ language })
        .where('uri', '=', post.uri)
        .execute();
    } catch (err) {
      console.error(post.uri, err);
    }
  }
})();
