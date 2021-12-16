import { debugNamespace } from 'universe/constants';
import Cors from 'cors';
import { debugFactory } from 'multiverse/debug-extended';

import type { NextApiRequest, NextApiResponse } from 'next';

const debug = debugFactory(`${debugNamespace}:glue:use-cors`);

let cors: ReturnType<typeof Cors>;

export type Options = {
  // No options
};

export default async function (req: NextApiRequest, res: NextApiResponse) {
  debug('entered middleware runtime');

  cors = cors || Cors({ methods: ['GET', 'POST', 'PUT', 'DELETE'] });
  await new Promise((resolve, reject) =>
    cors(req, res, (r) => (r instanceof Error ? reject : resolve)(r))
  );
}
