import { InvalidRequestError } from '@atproto/xrpc-server';
import { AtUri } from '@atproto/uri';
import jws from 'jws';
import { Server } from '../lexicon';
import { AppContext } from '../config';
import algos from '../algos';
import logger from '../logger';

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {
    const feedUri = new AtUri(params.feed);
    const algo = algos[feedUri.rkey];
    if (
      feedUri.hostname !== ctx.cfg.FEEDGEN_PUBLISHER_DID ||
      feedUri.collection !== 'app.bsky.feed.generator' ||
      !algo
    ) {
      throw new InvalidRequestError(
        'Unsupported algorithm',
        'UnsupportedAlgorithm',
      );
    }

    const body = await algo(ctx, params);
    return {
      encoding: 'application/json',
      body: body,
    };
  });
}
