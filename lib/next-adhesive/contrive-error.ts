import { isDueForContrivedError } from 'multiverse/next-contrived';
import { sendHttpContrivedError } from 'multiverse/next-api-respond';
import { debugFactory } from 'multiverse/debug-extended';

import type { NextApiRequest, NextApiResponse } from 'next';
import type { MiddlewareContext } from 'multiverse/next-api-glue';

const debug = debugFactory('next-adhesive:contrive-error');

export type Options = {
  /**
   * If `true`, every Nth request will fail with a contrived error.
   *
   * @default false
   */
  enableContrivedErrors?: boolean;
};

/**
 * Responds with a dummy error for every Nth request (see .env.example).
 */
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
