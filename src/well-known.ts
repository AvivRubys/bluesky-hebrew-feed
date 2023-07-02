import express from 'express';
import { AppContext } from './config';

const makeRouter = (ctx: AppContext) => {
  const router = express.Router();
  const serviceDid = `did:web:${ctx.cfg.FEEDGEN_HOSTNAME}`;

  router.get('/.well-known/did.json', (_req, res) => {
    res.json({
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: serviceDid,
      service: [
        {
          id: '#bsky_fg',
          type: 'BskyFeedGenerator',
          serviceEndpoint: `https://${ctx.cfg.FEEDGEN_HOSTNAME}`,
        },
      ],
    });
  });

  return router;
};
export default makeRouter;
