import { InvalidRequestError } from '@atproto/xrpc-server';
import { SelectQueryBuilder } from 'kysely';
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from './lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from './config';
import { DatabaseSchema, PostSchema } from './db/schema';
import { LANG_HEBREW, LANG_YIDDISH } from './util/hebrew';

function addCursor<T>(
  builder: SelectQueryBuilder<DatabaseSchema, 'post', T>,
  params: QueryParams,
) {
  if (!params.cursor) {
    return builder;
  }

  const [indexedAt, cid] = params.cursor.split('::');
  if (!indexedAt || !cid) {
    throw new InvalidRequestError('malformed cursor');
  }
  const timeStr = new Date(parseInt(indexedAt, 10)).toISOString();
  return builder
    .where('post.indexedAt', '<=', timeStr)
    .where('post.cid', '<', cid);
}

function renderFeed(posts: PostSchema[]) {
  const feed = posts.map((row) => ({
    post: row.uri,
  }));

  let cursor: string | undefined;
  const last = posts.at(-1);
  if (last) {
    cursor = `${new Date(last.indexedAt).getTime()}::${last.cid}`;
  }

  return {
    cursor,
    feed,
  };
}

async function hebrewFeedOnlyPosts(
  ctx: AppContext,
  params: QueryParams,
): Promise<AlgoOutput> {
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('language', '=', LANG_HEBREW)
    .where('post.replyTo', 'is', null)
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit);

  builder = addCursor(builder, params);

  return renderFeed(await builder.execute());
}

async function hebrewFeedAll(
  ctx: AppContext,
  params: QueryParams,
): Promise<AlgoOutput> {
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('language', '=', LANG_HEBREW)
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit);

  builder = addCursor(builder, params);

  return renderFeed(await builder.execute());
}

async function yiddishFeedAll(
  ctx: AppContext,
  params: QueryParams,
): Promise<AlgoOutput> {
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('language', '=', LANG_YIDDISH)
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit);

  builder = addCursor(builder, params);

  return renderFeed(await builder.execute());
}

type AlgoHandler = (
  ctx: AppContext,
  params: QueryParams,
) => Promise<AlgoOutput>;

const algos: Record<string, AlgoHandler> = {
  'yiddish-all': yiddishFeedAll,
  'hebrew-feed-all': hebrewFeedAll,
  'hebrew-feed': hebrewFeedOnlyPosts,
};

export default algos;
