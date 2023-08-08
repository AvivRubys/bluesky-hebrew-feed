import express from 'express';
import jws from 'jws';

export function getRequestingActor(req: express.Request): string | null {
  if (
    !req.headers.authorization ||
    !req.headers.authorization.startsWith('Bearer ')
  ) {
    return null;
  }

  const token = req.headers.authorization.substring('Bearer '.length).trim();
  return jws.decode(token)?.payload?.iss;
}
