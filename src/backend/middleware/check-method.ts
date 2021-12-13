import { getEnv } from 'universe/backend/env';
import { sendHttpBadMethod } from 'multiverse/next-api-respond';
import { name as pkgName } from 'package';
import debugFactory from 'debug';

import type { ValidHttpMethod } from 'universe/backend';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';

const debug = debugFactory(`${pkgName}:glue:check-method`);

export type Options = {
  /**
   * An array of HTTP2 methods this endpoint is allowed to serve.
   */
  methods?: ValidHttpMethod[];
};

export default async function (
  req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext & { options: Options }
) {
  debug('entered middleware runtime');

  if (res.writableEnded) {
    debug('res.end called: middleware skipped');
  } else if (
    !req.method ||
    getEnv().DISALLOWED_METHODS.includes(req.method) ||
    (context.options.methods &&
      !context.options.methods.includes(req.method as ValidHttpMethod))
  ) {
    debug(`request failed: unrecognized or disallowed method "${req.method}"`);
    sendHttpBadMethod(res);
  }
}
