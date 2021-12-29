import { getEnv } from 'multiverse/next-env';
import { clientIsRateLimited } from 'multiverse/next-limit';
import { debugFactory } from 'multiverse/debug-extended';

import {
  sendHttpRateLimited,
  sendHttpUnauthenticated
} from 'multiverse/next-api-respond';

import type { NextApiRequest, NextApiResponse } from 'next';

const debug = debugFactory('next-adhesive:limit-request');

export type Options = {
  // No options
};

export default async function (req: NextApiRequest, res: NextApiResponse) {
  debug('entered middleware runtime');

  const { limited, retryAfter } = await clientIsRateLimited(req);

  if (!getEnv().IGNORE_RATE_LIMITS && limited) {
    debug('request was rate-limited');
    sendHttpRateLimited(res, { retryAfter });
  } else if (getEnv().LOCKOUT_ALL_CLIENTS) {
    debug('request authentication failed: all clients locked out');
    sendHttpUnauthenticated(res);
  }
}