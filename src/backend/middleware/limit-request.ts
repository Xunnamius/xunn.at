import { getEnv } from 'universe/backend/env';
import { isRateLimited } from 'universe/backend/request';
import { name as pkgName } from 'package';
import debugFactory from 'debug';

import {
  sendHttpRateLimited,
  sendHttpUnauthenticated
} from 'multiverse/next-api-respond';

import type { NextApiRequest, NextApiResponse } from 'next';

const debug = debugFactory(`${pkgName}:glue:limit-request`);

export type Options = {
  // No options
};

export default async function (req: NextApiRequest, res: NextApiResponse) {
  debug('entered middleware runtime');

  if (res.writableEnded) {
    debug('res.end called: middleware skipped');
  } else {
    const { limited, retryAfter } = await isRateLimited(req);

    if (!getEnv().IGNORE_RATE_LIMITS && limited) {
      debug('request was rate-limited');
      sendHttpRateLimited(res, { retryAfter });
    } else if (getEnv().LOCKOUT_ALL_KEYS) {
      debug('request authentication failed: all keys locked out');
      sendHttpUnauthenticated(res);
    }
  }
}
