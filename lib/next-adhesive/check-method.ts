import { getEnv } from 'multiverse/next-env';
import { sendHttpBadMethod } from 'multiverse/next-api-respond';
import { debugFactory } from 'multiverse/debug-extended';

import type { ValidHttpMethod } from '@xunnamius/types';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';

const debug = debugFactory('next-adhesive:check-method');

export type Options = {
  /**
   * An array of HTTP methods this endpoint is allowed to serve.
   */
  allowedMethods?: ValidHttpMethod[];
};

/**
 * Rejects requests that are either using a disallowed method or not using an
 * allowed method.
 */
export default async function (
  req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext<Options>
) {
  debug('entered middleware runtime');
  debug(`original method: ${req.method}`);

  const method = req.method?.toUpperCase();
  const allowedMethods = context.options.allowedMethods?.map((m) => m.toUpperCase());

  if (
    !method ||
    // ? Already guaranteed uppercase thanks to next-env
    getEnv().DISALLOWED_METHODS.includes(method) ||
    !allowedMethods ||
    !allowedMethods.includes(method as ValidHttpMethod)
  ) {
    debug(
      `method check failed: unrecognized or disallowed method "${method || '(none)'}"`
    );

    res.setHeader('Allow', allowedMethods?.join(',') || '');
    sendHttpBadMethod(res);
  } else {
    debug(`method check succeeded: method "${method}" is allowed`);
  }
}
