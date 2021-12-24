import { NextApiRequest, NextApiResponse } from 'next';

// ? https://nextjs.org/docs/api-routes/api-middlewares#custom-config
export { defaultConfig as config } from 'universe/backend/api';

export default async (request: NextApiRequest, response: NextApiResponse) => {
  const { name = 'Mr. World' } = request.query;

  response.status(200).json({
    msg: `Hello to ${name} at timestamp ${new Date().getTime()}`,
    query: request.query,
    url: request.url
  });
};
