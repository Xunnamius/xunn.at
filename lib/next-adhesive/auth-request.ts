import { sendHttpUnauthenticated } from 'multiverse/next-api-respond';
import { debugFactory } from 'multiverse/debug-extended';
import { isValidAuthHeader } from 'multiverse/next-auth';

import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';

const debug = debugFactory('next-adhesive:auth-request');

export type Options = {
  /**
   * If `true`, accessing this endpoint requires a valid authorization header.
   */
  requiresAuth: boolean;
};

/**
 * Rejects unauthenticatable requests (via Authorization header).
 */
export default async function (
  req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext<Options>
) {
  debug('entered middleware runtime');

  const { authorization: header } = req.headers;

  if (context.options.requiresAuth) {
    const { valid, error } = await isValidAuthHeader({ header });

    if (!valid || error) {
      debug(`request authentication failed: ${error || 'bad auth header'}`);
      sendHttpUnauthenticated(res);
    } else {
      debug('request authentication succeeded');
    }
  }
}
