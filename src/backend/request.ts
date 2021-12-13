import { getClientIp } from 'request-ip';
import { getDb } from 'universe/backend/db';

import { HttpStatusCode } from '@xunnamius/types';
import type { NextApiRequest } from 'next';

import type {
  InternalRequestLogEntry,
  InternalLimitedLogEntry,
  NextApiState
} from 'types/global';

export async function isRateLimited(req: NextApiRequest) {
  const ip = getClientIp(req);
  const key = req.headers?.key?.toString() || null;

  const limited = await (
    await getDb({ name: 'system' })
  )
    .collection<InternalLimitedLogEntry>('limited-log-mview')
    .find({
      $or: [...(ip ? [{ ip }] : []), ...(key ? [{ key }] : [])],
      until: { $gt: Date.now() } // ? Skip the recently unbanned
    })
    .sort({ until: -1 })
    .limit(1)
    .next();

  return {
    limited: !!limited,
    retryAfter: Math.max(0, ((limited?.until as number) || Date.now()) - Date.now())
  };
}

/**
 * Note that this async function does not have to be awaited. It's fire and
 * forget!
 */
export async function addToRequestLog({ req, res }: NextApiState) {
  await (await getDb({ name: 'system' }))
    .collection<InternalRequestLogEntry>('request-log')
    .insertOne({
      ip: getClientIp(req),
      key: req.headers?.key?.toString() || null,
      method: req.method || null,
      route: req.url?.replace(/^\/api\//, '') || null,
      resStatusCode: res.statusCode as HttpStatusCode,
      time: Date.now()
    });
}
