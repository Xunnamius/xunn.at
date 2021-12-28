import { getEnv } from 'multiverse/next-env';
import { getDb } from 'multiverse/mongo-schema';
import { getClientIp } from 'request-ip';

import type { NextApiRequest, NextApiResponse } from 'next';

import type { HttpStatusCode, UnixEpochMs } from '@xunnamius/types';

/**
 * The shape of an entry in the well-known "request log" collection.
 */
export type InternalRequestLogEntry = {
  ip: string | null;
  header: string | null;
  route: string | null;
  method: string | null;
  resStatusCode: HttpStatusCode;
  createdAt: UnixEpochMs;
};

/**
 * Note that this async function does not have to be awaited. It's fire and
 * forget!
 */
export async function addToRequestLog({
  req,
  res
}: {
  req: NextApiRequest;
  res: NextApiResponse;
}) {
  return (await getDb({ name: 'system' }))
    .collection<InternalRequestLogEntry>('request-log')
    .insertOne({
      ip: getClientIp(req),
      header:
        req.headers.authorization?.slice(0, getEnv().AUTH_HEADER_MAX_LENGTH) || null,
      method: req.method || null,
      route: req.url || null,
      resStatusCode: res.statusCode as HttpStatusCode,
      createdAt: Date.now()
    });
}
