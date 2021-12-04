import { handleEndpoint } from 'universe/backend/middleware';
import { sendBadgeSvgResponse, getNpmPackageVersion } from 'universe/backend';

import type { NextApiResponse, NextApiRequest } from 'next';

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { config } from 'universe/backend/middleware';

export default async function (req: NextApiRequest, res: NextApiResponse) {
  await handleEndpoint(
    async ({ req, res }) => {
      let version: string | null = null;
      const {
        query: { pkgName }
      } = req;
      const pkg = Array.from(pkgName).join('/');

      try {
        version = await getNpmPackageVersion(pkg);
      } catch (ignored) {
        // eslint-disable-next-line no-console
        console.warn('warn  -', ignored);
      }

      await sendBadgeSvgResponse(res, {
        label: 'npm install',
        message: !version ? 'error' : `${pkg}@${version}`,
        color: !version ? 'red' : 'blue'
      });
    },
    {
      group: 'badges',
      req,
      res,
      config: {
        allowedMethods: ['GET'],
        authRequired: false
      }
    }
  );
}
