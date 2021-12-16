import { debugNamespace } from 'universe/constants';
import { getEnv } from 'universe/backend/env';
import { sendHttpBadMethod } from 'multiverse/next-api-respond';
import { debugFactory } from 'multiverse/debug-extended';

import type { ValidHttpMethod } from 'universe/backend';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';

const debug = debugFactory(`${debugNamespace}:glue:check-method`);

export type Options = {
  /**
   * An array of HTTP methods this endpoint is allowed to serve.
   */
  allowedMethods?: ValidHttpMethod[];
};

export default async function (
  req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext<Options>
) {
  debug('entered middleware runtime');

  if (
    !req.method ||
    getEnv().DISALLOWED_METHODS.includes(req.method) ||
    (context.options.allowedMethods &&
      !context.options.allowedMethods.includes(req.method as ValidHttpMethod))
  ) {
    debug(`request failed: unrecognized or disallowed method "${req.method}"`);
    sendHttpBadMethod(res);
  }
}
