import { debugNamespace } from 'universe/constants';
import { isDueForContrivedError } from 'universe/backend/request';
import { sendHttpContrivedError } from 'multiverse/next-api-respond';
import { debugFactory } from 'multiverse/debug-extended';

import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';

const debug = debugFactory(`${debugNamespace}:glue:contrive-error`);

export type Options = {
  /**
   * If `true`, every Nth request will fail with a contrived error.
   *
   * @default false
   */
  enableContrivedErrors?: boolean;
};

export default async function (
  _req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext<Options>
) {
  debug('entered middleware runtime');

  if (context.options.enableContrivedErrors && isDueForContrivedError()) {
    debug('request failed: contrived error');
    sendHttpContrivedError(res);
  }
}
