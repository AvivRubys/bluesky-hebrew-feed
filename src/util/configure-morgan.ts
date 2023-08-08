import morgan from 'morgan';
import { getRequestingActor } from './auth';
import { Request } from 'express';

morgan
  .token<Request>('bsky-user', (req) => getRequestingActor(req) ?? undefined)
  .token('decoded-url', (req) =>
    decodeURIComponent((req as any).originalUrl || req.url),
  )
  .format(
    'bsky-feed-generator',
    ':date[iso] :bsky-user ":method :decoded-url" :status',
  );
