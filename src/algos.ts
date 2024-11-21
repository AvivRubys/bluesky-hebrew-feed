import fs from 'fs/promises';
import { InvalidRequestError } from '@atproto/xrpc-server';
import { Selectable, SelectQueryBuilder } from 'kysely';
import { addYears } from 'date-fns';
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from './lexicon/types/app/bsky/feed/getFeedSkeleton';
import { PostSchema } from './db/schema';
import { LANGS_HEBREW, LANGS_YIDDISH } from './util/hebrew';
import { FILTERED_USERS } from './util/userlists';
import { AppContext } from './context';
import logger from './logger';

type Post = Selectable<PostSchema>;

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
  return builder.where('effectiveTimestamp', '<=', timeStr);
}

function renderFeed(posts: Pick<Post, 'effectiveTimestamp' | 'uri'>[]) {
  const feed = posts.map((row) => ({
    post: row.uri,
  }));

  let cursor: string | undefined;
  const last = posts.at(-1);
  if (last) {
    cursor = new Date(last.effectiveTimestamp).getTime().toString();
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
      .select(['effectiveTimestamp', 'uri'])
      .where('language', 'in', languages)
      .where('author', 'not in', FILTERED_USERS)
      .orderBy('effectiveTimestamp', 'desc')
      .orderBy('cid', 'desc')
      .limit(params.limit);

    // if (Array.isArray(ctx.cfg.FILTERED_USERS)) {
    //   logger.info("Constant filtered users - " + FILTERED_USERS);
    //   logger.info("Config filtered users - " + ctx.cfg.FILTERED_USERS.join(','));
    //   builder = builder.where('author', 'not in', ctx.cfg.FILTERED_USERS);
    // }

    if (includeReplies) {
      if (actor) {
        const blocklist = await ctx.block.getBlocksFor(actor);

        if (blocklist && blocklist.length > 0) {
          builder = builder.where((eb) =>
            eb.or([
              eb('replyTo', 'is', null),
              eb('replyTo', 'not in', (eb) =>
                eb
                  .selectFrom('post')
                  .select('uri')
                  .where('author', 'in', blocklist),
              ),
            ]),
          );
        }
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
        .select(['uri', 'effectiveTimestamp'])
        .where('language', 'in', LANGS_HEBREW)
        .where('post.replyTo', 'is', null)
        .where('author', 'not in', FILTERED_USERS)
        .orderBy('author')
        .orderBy('effectiveTimestamp', 'asc'),
    )
    .selectFrom('first_posts')
    .selectAll()
    .orderBy('effectiveTimestamp', 'desc')
    .limit(params.limit);

  builder = addCursor(builder, params);

  return renderFeed(await builder.execute());
}

async function experimentsFeed(ctx: AppContext, params: QueryParams) {
  if (!ctx.cfg.EXPERIMENT_FEED_SOURCE_FILEPATH) {
    return { feed: [] };
  }

  try {
    const file = await fs.readFile(ctx.cfg.EXPERIMENT_FEED_SOURCE_FILEPATH);
    const contents = file.toString();
    return JSON.parse(contents) as AlgoOutput;
  } catch (err) {
    logger.error(err, 'Error rendering experimental feed');
    return { feed: [] };
  }
}

function oneYearAgo(feedGenerator: AlgoHandler) {
  return async (ctx: AppContext, params: QueryParams, actor?: string) => {
    if (params.cursor) {
      return await feedGenerator(ctx, params, actor);
    }

    const oneYearAgo = addYears(new Date(), -1);
    return await feedGenerator(
      ctx,
      { ...params, cursor: oneYearAgo.getTime().toString() },
      actor,
    );
  };
}

type AlgoHandler = (
  ctx: AppContext,
  params: QueryParams,
  actor?: string,
) => Promise<AlgoOutput>;

const algos: Record<string, AlgoHandler> = {
  'yiddish-all': createLanguageFeed(LANGS_YIDDISH, true),
  'hebrew-feed-all': createLanguageFeed(LANGS_HEBREW, true),
  'hebrew-milifney': oneYearAgo(createLanguageFeed(LANGS_HEBREW, true)),
  'hebrew-feed': createLanguageFeed(LANGS_HEBREW, false),
  'hebrew-noobs': firstHebrewPostsFeed,
  'experiment-feed': experimentsFeed,
};

export default algos;
