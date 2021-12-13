import { name as pkgName } from 'package';
import Cors from 'cors';
import debugFactory from 'debug';

import type { NextApiRequest, NextApiResponse } from 'next';

const debug = debugFactory(`${pkgName}:glue:use-cors`);

let cors: ReturnType<typeof Cors>;

export type Options = {
  // No options
};

export default async function (req: NextApiRequest, res: NextApiResponse) {
  debug('entered middleware runtime');

  if (res.writableEnded) {
    debug('res.end called: middleware skipped');
  } else {
    cors = cors || Cors({ methods: ['GET', 'POST', 'PUT', 'DELETE'] });
    await new Promise((resolve, reject) =>
      cors(req, res, (r) => (r instanceof Error ? reject : resolve)(r))
    );
  }
}
