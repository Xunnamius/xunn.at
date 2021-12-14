import { testApiHandler } from 'next-test-api-route-handler';
import { withMiddleware } from 'multiverse/next-api-glue';

import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';

const MAX_CONTENT_LENGTH_BYTES = 100000;
const MAX_CONTENT_LENGTH_BYTES_PLUS_1 = 100001;

const noop = async (_req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).send({});
};

const wrapHandler = (handler: NextApiHandler) => {
  const api = async (req: NextApiRequest, res: NextApiResponse) => handler(req, res);
  api.config = {
    api: {
      bodyParser: {
        get sizeLimit() {
          return MAX_CONTENT_LENGTH_BYTES;
        }
      }
    }
  };
  return api;
};

describe('::withMiddleware', () => {
  it('next.js rejects requests that are too big when exporting config', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: wrapHandler(withMiddleware(noop, { use: [] })),
      test: async ({ fetch }) => {
        await expect(
          fetch({
            method: 'POST',
            body: Array.from({ length: MAX_CONTENT_LENGTH_BYTES_PLUS_1 })
              .map(() => 'x')
              .join('')
          }).then((r) => r.status)
        ).resolves.toBe(413);
      }
    });
  });

  it('responds with 501 not implemented if res.end() not called', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: wrapHandler(withMiddleware(async () => undefined, { use: [] })),
      test: async ({ fetch }) => expect((await fetch()).status).toBe(501)
    });
  });

  it('responds with 501 not implemented if wrapped handler is undefined', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: wrapHandler(withMiddleware(undefined, { use: [] })),
      test: async ({ fetch }) => expect((await fetch()).status).toBe(501)
    });
  });

  it('lowercases headers automatically', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: wrapHandler(
        withMiddleware(
          async (req, res) => {
            res.status(req.headers.key == '1234' ? 200 : 555).send({});
          },
          { use: [] }
        )
      ),
      test: async ({ fetch }) =>
        expect((await fetch({ headers: { KEY: '1234' } })).status).toBe(200)
    });
  });

  it('parses url parameters as expected', async () => {
    expect.hasAssertions();

    await testApiHandler({
      requestPatcher: (req) => {
        req.url = '/?some=url&yes';
      },
      handler: wrapHandler(
        withMiddleware(
          async (req, res) => {
            expect(req.query).toStrictEqual({ some: 'url', yes: '' });
            res.status(200).send({});
          },
          { use: [] }
        )
      ),
      test: async ({ fetch }) => {
        expect((await fetch()).status).toBe(200);
      }
    });
  });
});
