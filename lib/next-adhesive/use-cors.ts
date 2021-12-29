import Cors from 'cors';
import { debugFactory } from 'multiverse/debug-extended';

import type { NextApiRequest, NextApiResponse } from 'next';

const debug = debugFactory('next-adhesive:use-cors');

let cors: ReturnType<typeof Cors>;

export type Options = {
  // No options
};

/**
 * Allows _cross-origin_ requests for the most popular request types. **Note
 * that this can be dangerous (huge security hole) and should only be used for
 * public APIs**.
 *
 * When present, this should be among the very first middleware in the chain.
 */
export default async function (req: NextApiRequest, res: NextApiResponse) {
  debug('entered middleware runtime');

  cors = cors || Cors({ methods: ['GET', 'POST', 'PUT', 'DELETE'] });
  await new Promise((resolve, reject) =>
    cors(req, res, (r) => (r instanceof Error ? reject : resolve)(r))
  );
}
