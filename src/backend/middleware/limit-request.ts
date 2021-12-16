import { debugNamespace } from 'universe/constants';
import { getEnv } from 'universe/backend/env';
import { isRateLimited } from 'universe/backend/request';
import { debugFactory } from 'multiverse/debug-extended';

import {
  sendHttpRateLimited,
  sendHttpUnauthenticated
} from 'multiverse/next-api-respond';

import type { NextApiRequest, NextApiResponse } from 'next';

const debug = debugFactory(`${debugNamespace}:glue:limit-request`);

export type Options = {
  // No options
};

export default async function (req: NextApiRequest, res: NextApiResponse) {
  debug('entered middleware runtime');

  const { limited, retryAfter } = await isRateLimited(req);

  if (!getEnv().IGNORE_RATE_LIMITS && limited) {
    debug('request was rate-limited');
    sendHttpRateLimited(res, { retryAfter });
  } else if (getEnv().LOCKOUT_ALL_CLIENTS) {
    debug('request authentication failed: all clients locked out');
    sendHttpUnauthenticated(res);
  }
}
