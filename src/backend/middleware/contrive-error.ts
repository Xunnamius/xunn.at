import { isDueForContrivedError } from 'universe/backend/request';
import { sendHttpContrivedError } from 'multiverse/next-api-respond';
import { name as pkgName } from 'package';
import debugFactory from 'debug';

import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';

const debug = debugFactory(`${pkgName}:glue:contrive-error`);

export type Options = {
  /**
   * If `true`, every Nth request will fail with a contrived error.
   */
  enableContrivedErrors: boolean;
};

export default async function (
  _req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext & { options: Options }
) {
  debug('entered middleware runtime');

  if (res.writableEnded) {
    debug('res.end called: middleware skipped');
  } else if (context.options.enableContrivedErrors && isDueForContrivedError()) {
    debug('request failed: contrived error');
    sendHttpContrivedError(res);
  }
}
