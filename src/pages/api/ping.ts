import { sendHttpOk } from 'multiverse/next-api-respond';
import { NextApiRequest, NextApiResponse } from 'next';

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { defaultConfig as config } from 'universe/backend/api';

export default async (req: NextApiRequest, res: NextApiResponse) => {
  const { name = 'Mr. World' } = req.query;
  sendHttpOk(res, {
    message: `Hello to ${name} at ${new Date().toLocaleString()}`
  });
};
