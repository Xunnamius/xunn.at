import { addToRequestLog } from 'universe/backend/request';
import { name as pkgName } from 'package';
import debugFactory from 'debug';

import type { NextApiRequest, NextApiResponse } from 'next';

const debug = debugFactory(`${pkgName}:glue:log-request`);

export type Options = {
  // No options
};

export default async function (req: NextApiRequest, res: NextApiResponse) {
  debug('entered middleware runtime');

  if (res.writableEnded) {
    debug('res.end called: middleware skipped');
  } else {
    const send = res.send;
    res.send = (...args) => {
      debug('res.send called');
      void addToRequestLog({ req, res });
      send(...args);
    };
  }
}
