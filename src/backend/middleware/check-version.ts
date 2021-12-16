import { debugNamespace } from 'universe/constants';
import { getEnv } from 'universe/backend/env';
import { sendHttpNotFound } from 'multiverse/next-api-respond';
import { debugFactory } from 'multiverse/debug-extended';

import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';

const debug = debugFactory(`${debugNamespace}:glue:check-version`);

export type Options = {
  /**
   * The version of the api this endpoint serves.
   */
  apiVersion?: string;
};

export default async function (
  _req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext<Options>
) {
  debug('entered middleware runtime');

  if (
    context.options.apiVersion !== undefined &&
    getEnv().DISABLED_API_VERSIONS.includes(context.options.apiVersion)
  ) {
    debug('request failed: api version of endpoint is disabled');
    sendHttpNotFound(res);
  }
}
