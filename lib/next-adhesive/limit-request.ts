import { getEnv } from 'multiverse/next-env';
import { clientIsRateLimited } from 'multiverse/next-limit';
import { debugFactory } from 'multiverse/debug-extended';

import { sendHttpRateLimited, sendHttpUnauthorized } from 'multiverse/next-api-respond';

import type { NextApiRequest, NextApiResponse } from 'next';

const debug = debugFactory('next-adhesive:limit-request');

export type Options = {
  // No options
};

/**
 * Rejects requests from clients that have sent too many previous requests.
 */
export default async function (req: NextApiRequest, res: NextApiResponse) {
  debug('entered middleware runtime');

  if (getEnv().LOCKOUT_ALL_CLIENTS) {
    debug('rate-limit check failed: all clients locked out');
    sendHttpUnauthorized(res, {
      error: 'backend has temporarily locked out all clients'
    });
  } else if (getEnv().IGNORE_RATE_LIMITS) {
    debug('skipped rate-limit check');
  } else {
    const { isLimited, retryAfter } = await clientIsRateLimited(req);

    if (isLimited) {
      debug('rate-limit check failed: client is rate-limited');
      res.setHeader('Retry-After', Math.ceil(retryAfter / 1000));
      sendHttpRateLimited(res, { retryAfter });
    } else {
      debug('rate-limit check succeeded: client not rate-limited');
    }
  }
}
