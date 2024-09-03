import { Server } from '../lexicon';
import algos from '../algos';
import { AtUri } from '@atproto/syntax';
import { AppContext } from '../context';

export default function (server: Server, ctx: AppContext) {
  const serviceDid = `did:web:${ctx.cfg.FEEDGEN_HOSTNAME}`;

  server.app.bsky.feed.describeFeedGenerator(async () => {
    const feeds = Object.keys(algos).map((shortname) => ({
      uri: AtUri.make(
        ctx.cfg.FEEDGEN_PUBLISHER_DID,
        'app.bsky.feed.generator',
        shortname,
      ).toString(),
    }));

    return {
      encoding: 'application/json',
      body: {
        did: serviceDid,
        feeds,
      },
    };
  });
}
