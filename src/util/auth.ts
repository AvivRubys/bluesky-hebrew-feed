import express from 'express';
import jws from 'jws';

export function getRequestingActor(req: express.Request): string | undefined {
  if (
    !req.headers.authorization ||
    !req.headers.authorization.startsWith('Bearer ')
  ) {
    return undefined;
  }

  const token = req.headers.authorization.substring('Bearer '.length).trim();
  return jws.decode(token)?.payload?.iss ?? undefined;
}
