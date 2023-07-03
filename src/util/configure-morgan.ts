import morgan from 'morgan';
import jws from 'jws';

morgan
  .token('bsky-user', (req) => parseBearer(req.headers.authorization))
  .token('decoded-url', (req) =>
    decodeURIComponent((req as any).originalUrl || req.url),
  )
  .format(
    'bsky-feed-generator',
    ':date[iso] :bsky-user ":method :decoded-url" :status',
  );

function parseBearer(authorizationHeader?: string) {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authorizationHeader.substring('Bearer '.length).trim();
  return jws.decode(token)?.payload?.iss;
}
