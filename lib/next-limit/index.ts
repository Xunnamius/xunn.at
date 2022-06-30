import { getDb } from 'multiverse/mongo-schema';
import { getEnv } from 'multiverse/next-env';
import { getClientIp } from 'request-ip';
import { ValidationError } from 'universe/error';

import type { NextApiRequest } from 'next';
import type { UnixEpochMs } from '@xunnamius/types';
import type { UpdateResult, WithId, WithoutId } from 'mongodb';

/**
 * The shape of an entry in the well-known "limited log" collection.
 */
export type InternalLimitedLogEntry = WithId<
  | {
      until: UnixEpochMs;
      ip: string;
      header?: never;
    }
  | {
      until: UnixEpochMs;
      ip?: never;
      header: string;
    }
>;

/**
 * The shape of a new entry in the well-known "limited log" collection.
 */
export type NewLimitedLogEntry = WithoutId<InternalLimitedLogEntry>;

/**
 * Returns an object with two keys: `isLimited` and `retryAfter`. If `isLimited`
 * is true, then the request should be rejected. The client should be instructed
 * to retry their request after `retryAfter` milliseconds have passed.
 */
export async function clientIsRateLimited(req: NextApiRequest) {
  const ip = getClientIp(req);
  const header = req.headers.authorization
    ?.slice(0, getEnv().AUTH_HEADER_MAX_LENGTH)
    .toLowerCase();

  const limited = await (
    await getDb({ name: 'root' })
  )
    .collection<InternalLimitedLogEntry>('limited-log')
    .find({
      $or: [...(ip ? [{ ip }] : []), ...(header ? [{ header }] : [])],
      until: { $gt: Date.now() } // ? Skip the recently unbanned
    })
    .sort({ until: -1 })
    .limit(1)
    .next();

  return {
    isLimited: !!limited,
    retryAfter: Math.max(
      0,
      ((limited?.until as number) || Date.now()) - Date.now()
    ) as UnixEpochMs
  };
}

/**
 * Removes a rate limit on a client matched against either `ip`, `header`, or
 * both. Matching against both removes rate limits that match either criterion.
 *
 * @returns The number of rate limits removed.
 */
export async function removeRateLimit({
  target
}: {
  target: { ip?: string; header?: string } | undefined;
}) {
  if (target) {
    const { ip, header } = target;

    if (ip !== undefined || header !== undefined) {
      if (ip !== undefined && (typeof ip != 'string' || !ip)) {
        throw new ValidationError('ip must be a non-empty string');
      }

      if (header !== undefined && (typeof header != 'string' || !header)) {
        throw new ValidationError('header must be a non-empty string');
      }

      const now = Date.now();
      const result = (await (await getDb({ name: 'root' }))
        .collection<InternalLimitedLogEntry>('limited-log')
        .updateMany(
          {
            $or: [...(ip ? [{ ip }] : []), ...(header ? [{ header }] : [])],
            until: { $gt: now } // ? Skip the recently unbanned
          },
          { $set: { until: now } }
        )) as UpdateResult;

      return result.modifiedCount;
    }
  }

  throw new ValidationError('must provide either an ip or a header');
}

/**
 * Retrieve all active rate limits.
 */
export async function getAllRateLimits() {
  return (await getDb({ name: 'root' }))
    .collection<InternalLimitedLogEntry>('limited-log')
    .find<WithoutId<InternalLimitedLogEntry>>(
      { until: { $gt: Date.now() } },
      { sort: { _id: -1 }, projection: { _id: false } }
    )
    .toArray();
}
