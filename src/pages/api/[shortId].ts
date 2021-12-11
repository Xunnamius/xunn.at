import { wrapHandler } from 'universe/backend/middleware';
// import {} from 'universe/backend';

import type { NextApiResponse, NextApiRequest } from 'next';

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { defaultConfig as config } from 'universe/backend/middleware';

export default async function (req: NextApiRequest, res: NextApiResponse) {
  await wrapHandler(
    async ({ req, res }) => {
      let version: string | null = null;
      const {
        query: { pkgName }
      } = req;
      const pkg = Array.from(pkgName).join('/');
    },
    { req, res, methods: ['GET'], apiVersion: 1 }
  );
}
