import { withMiddleware } from 'universe/backend/middleware';
import { handlePackageRequest } from 'universe/backend/gitpkg';
// import {} from 'universe/backend';

import type { NextApiResponse, NextApiRequest } from 'next';

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { defaultConfig as config } from 'universe/backend/middleware';

export default async function (req: NextApiRequest, res: NextApiResponse) {
  await withMiddleware(
    async ({ req, res }) => {
      await handlePackageRequest({
        query: req.query,
        requestUrl: req.url,
        parseFromUrl: true,
        response: res
      });
    },
    { req, res, methods: ['GET'], apiVersion: 1 }
  );
}
