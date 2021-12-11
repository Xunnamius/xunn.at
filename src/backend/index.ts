import { getClientIp } from 'request-ip';
import { getDb } from 'universe/backend/db';

import { HttpStatusCode } from '@xunnamius/next-types';
import type { NextApiRequest } from 'next';

import type {
  InternalRequestLogEntry,
  InternalLimitedLogEntry,
  NextApiState
} from 'types/global';

/**
 * This key is guaranteed never to appear in dummy data generated during tests.
 * In production, this key can be used to represent a `null` or non-existent
 * key. This key cannot be used for authenticated HTTP access to the API.
 */
export const NULL_KEY = '00000000-0000-0000-0000-000000000000';

/**
 * This key is used by database initialization and activity simulation scripts.
 * This key cannot be used for authenticated HTTP access to the API in
 * production.
 */
export const MACHINE_KEY = '11111111-1111-1111-1111-111111111111';

/**
 * This key allows authenticated API access only when running in a test
 * environment (i.e. `NODE_ENV=test`). This key cannot be used for authenticated
 * HTTP access to the API in production.
 */
export const DUMMY_KEY = '12349b61-83a7-4036-b060-213784b491';

/**
 * This key is guaranteed to be rate limited when running in a test environment
 * (i.e. `NODE_ENV=test`). This key cannot be used for authenticated HTTP access
 * to the API in production.
 */
export const BANNED_KEY = 'banned-h54e-6rt7-gctfh-hrftdygct0';

/**
 * This key can be used to authenticate with local and non-production
 * deployments. This key cannot be used for authenticated HTTP access to the API
 * in production.
 */
export const DEV_KEY = 'dev-xunn-dev-294a-536h-9751-rydmj';

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
