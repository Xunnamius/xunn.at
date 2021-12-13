import { isValidAuthHeader } from 'universe/backend/request';
import { sendHttpUnauthenticated } from 'multiverse/next-api-respond';
import { name as pkgName } from 'package';
import debugFactory from 'debug';

import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';

const debug = debugFactory(`${pkgName}:glue:auth-request`);

export type Options = {
  /**
   * Whether the endpoint requires authentication or not.
   */
  requiresAuth: boolean;
};

export default async function (
  req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext & { options: Options }
) {
  debug('entered middleware runtime');

  if (res.writableEnded) {
    debug('res.end called: middleware skipped');
  } else {
    const { authorization } = req.headers;

    if (context.options.requiresAuth) {
      if (typeof authorization != 'string' || !(await isValidAuthHeader(authorization))) {
        debug('request authentication failed: bad auth header');
        sendHttpUnauthenticated(res);
      } else {
        debug('request authentication succeeded');
      }
    }
  }
}
