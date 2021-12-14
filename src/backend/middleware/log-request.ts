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

  const send = res.end;
  res.end = ((...args: Parameters<typeof res.end>) => {
    const sent = res.writableEnded;
    send(...args);

    if (!sent) {
      debug('logging request after initial call to res.end');
      void addToRequestLog({ req, res });
    }
  }) as typeof res.end;
}
