import { Histogram } from 'prom-client';
import { InvalidRequestError } from '@atproto/xrpc-server';
import { AtUri } from '@atproto/uri';
import { Server } from '../lexicon';
import algos from '../algos';
import logger from '../logger';
import { getRequestingActor } from '../util/auth';
import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import { AppContext } from '../context';

const feedGenerationHistogram = new Histogram({
  name: 'feed_generation_duration',
  help: 'Feed generation duration',
  labelNames: ['actor', 'status', 'feed'],
});

function decipherAlgorithm(publisherDid: string, params: QueryParams) {
  const feedUri = new AtUri(params.feed);
  const feedGenerator = algos[feedUri.rkey];

  if (
    feedUri.hostname !== publisherDid ||
    feedUri.collection !== 'app.bsky.feed.generator' ||
    !feedGenerator
  ) {
    throw new InvalidRequestError(
      'Unsupported algorithm',
      'UnsupportedAlgorithm',
    );
  }

  return { feedGenerator, feedUri };
}

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {
    const { feedGenerator, feedUri } = decipherAlgorithm(
      ctx.cfg.FEEDGEN_PUBLISHER_DID,
      params,
    );
    const actor = getRequestingActor(req);
    const endTimer = feedGenerationHistogram.startTimer({
      actor: actor ?? 'unknown',
      feed: feedUri.rkey,
    });
    try {
      const body = await feedGenerator(ctx, params, actor);
      endTimer({ status: 'success' });

      return {
        encoding: 'application/json',
        body: body,
      };
    } catch (err) {
      logger.error({ err, feedUri }, 'Error while generating feed');
      endTimer({ status: 'failure' });
      throw err;
    }
  });
}
