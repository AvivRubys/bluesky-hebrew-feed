import { InvalidRequestError } from '@atproto/xrpc-server';
import { SelectQueryBuilder, sql } from 'kysely';
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from './lexicon/types/app/bsky/feed/getFeedSkeleton';
import { PostSchema } from './db/schema';
import { LANGS_HEBREW, LANGS_YIDDISH } from './util/hebrew';
import { FILTERED_USERS } from './util/userlists';
import { AppContext } from './context';

function addCursor<T>(
  builder: SelectQueryBuilder<any, any, T>,
  params: QueryParams,
) {
  if (!params.cursor) {
    return builder;
  }

  const indexedAt = params.cursor;
  if (!indexedAt) {
    throw new InvalidRequestError('malformed cursor');
  }
  const timeStr = new Date(parseInt(indexedAt, 10)).toISOString();
  return builder.where('indexedAt', '<=', timeStr);
}

function renderFeed(posts: Pick<PostSchema, 'indexedAt' | 'uri'>[]) {
  const feed = posts.map((row) => ({
    post: row.uri,
  }));

  let cursor: string | undefined;
  const last = posts.at(-1);
  if (last) {
    cursor = new Date(last.indexedAt).getTime().toString();
  }

  return {
    cursor,
    feed,
  };
}

function createLanguageFeed(
  languages: string[],
  includeReplies: boolean,
): AlgoHandler {
  return async (ctx: AppContext, params: QueryParams, actor?: string) => {
    let builder = ctx.db
      .selectFrom('post')
      .select(['indexedAt', 'uri'])
      .where('language', 'in', languages)
      .where('author', 'not in', FILTERED_USERS)
      .orderBy('indexedAt', 'desc')
      .orderBy('cid', 'desc')
      .limit(params.limit);

    if (includeReplies) {
      if (actor) {
        await ctx.block.verifyForActor(actor);

        builder = builder.where((eb) =>
          eb.or([
            eb('replyTo', 'is', null),
            eb('replyTo', 'not in', (eb) =>
              eb
                .selectFrom('post')
                .select('uri')
                .innerJoin('block_cache', (eb) =>
                  eb.onRef('author', '=', 'did'),
                )
                .whereRef('uri', 'not in', 'blockedDids'),
            ),
          ]),
        );
      }
    } else {
      builder = builder.where('post.replyTo', 'is', null);
    }

    builder = addCursor(builder, params);

    return renderFeed(await builder.execute());
  };
}

async function firstHebrewPostsFeed(
  ctx: AppContext,
  params: QueryParams,
): Promise<AlgoOutput> {
  let builder = ctx.db
    .with('first_posts', (eb) =>
      eb
        .selectFrom('post')
        .distinctOn('author')
        .select(['uri', 'indexedAt'])
        .where('language', 'in', LANGS_HEBREW)
        .where('post.replyTo', 'is', null)
        .where('author', 'not in', FILTERED_USERS)
        .orderBy('author')
        .orderBy('indexedAt', 'asc'),
    )
    .selectFrom('first_posts')
    .selectAll()
    .orderBy('indexedAt', 'desc')
    .limit(params.limit);

  builder = addCursor(builder, params);

  return renderFeed(await builder.execute());
}

type AlgoHandler = (
  ctx: AppContext,
  params: QueryParams,
  actor?: string,
) => Promise<AlgoOutput>;

const algos: Record<string, AlgoHandler> = {
  'yiddish-all': createLanguageFeed(LANGS_YIDDISH, true),
  'hebrew-feed-all': createLanguageFeed(LANGS_HEBREW, true),
  'hebrew-feed': createLanguageFeed(LANGS_HEBREW, false),
  'hebrew-noobs': firstHebrewPostsFeed,
};

export default algos;
