import { getEnv } from 'multiverse/next-env';
import { getDb } from 'multiverse/mongo-schema';
import { getClientIp } from 'request-ip';

import type { NextApiRequest, NextApiResponse } from 'next';
import type { HttpStatusCode, UnixEpochMs } from '@xunnamius/types';
import type { WithId, WithoutId } from 'mongodb';

/**
 * The shape of an entry in the well-known "request log" collection.
 */
export type InternalRequestLogEntry = WithId<{
  ip: string | null;
  header: string | null;
  route: string | null;
  method: string | null;
  resStatusCode: HttpStatusCode;
  createdAt: UnixEpochMs;
}>;

/**
 * The shape of a new entry in the well-known "request log" collection.
 */
export type NewRequestLogEntry = WithoutId<InternalRequestLogEntry>;

/**
 * This function adds a request metadata entry to the database.
 *
 * Note that this async function **does not have to be awaited**. It's fire and
 * forget!
 *
 * @example
 * ```
 * doSomeStuff();
 * void addToRequestLog({ req, res });
 * doSomeOtherStuff();
 * ```
 */
export async function addToRequestLog({
  req,
  res
}: {
  req: NextApiRequest;
  res: NextApiResponse;
}): Promise<void> {
  void (await getDb({ name: 'root' }))
    .collection<NewRequestLogEntry>('request-log')
    .insertOne({
      ip: getClientIp(req),
      header:
        req.headers.authorization
          ?.slice(0, getEnv().AUTH_HEADER_MAX_LENGTH)
          .toLowerCase() || null,
      method: req.method || null,
      route: req.url || null,
      resStatusCode: res.statusCode as HttpStatusCode,
      createdAt: Date.now()
    });
}
