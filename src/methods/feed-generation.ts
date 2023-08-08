import { InvalidRequestError } from '@atproto/xrpc-server';
import { AtUri } from '@atproto/uri';
import { Server } from '../lexicon';
import { AppContext } from '../config';
import algos from '../algos';
import logger from '../logger';
import { getRequestingActor } from '../util/auth';

export default function (server: Server, ctx: AppContext) {
  const serviceDid = `did:web:${ctx.cfg.FEEDGEN_HOSTNAME}`;

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

    try {
      const actor = getRequestingActor(req);
      const body = await algo(ctx, params, actor ?? undefined);

      return {
        encoding: 'application/json',
        body: body,
      };
    } catch (err) {
      logger.error({ err, feedUri }, 'Error while generating feed');
      throw err;
    }
  });
}
