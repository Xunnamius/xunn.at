import { NextApiRequest, NextApiResponse } from 'next';

export default async (request: NextApiRequest, response: NextApiResponse) => {
  const { name = 'World' } = request.query;

  response.status(200).json({
    msg: `Hello ${name} at timestamp ${new Date().getTime()}`,
    query: request.query,
    url: request.url
  });
};
