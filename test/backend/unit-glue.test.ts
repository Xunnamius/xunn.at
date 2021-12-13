/* eslint-disable no-await-in-loop */
import { testApiHandler } from 'next-test-api-route-handler';
import { getEnv } from 'universe/backend/env';
import { toss } from 'toss-expression';
import { asMockedFunction } from '@xunnamius/jest-types';
import { DUMMY_KEY, ValidHttpMethod } from 'universe/backend';
import { addToRequestLog, isRateLimited } from 'universe/backend/request';
import { withMiddleware } from 'universe/backend/middleware';
import { defaultConfig as middlewareConfig } from 'universe/backend/api';
import { isolatedImport, itemFactory, mockEnvFactory } from 'testverse/setup';

import {
  InvalidIdError,
  InvalidKeyError,
  ValidationError,
  NotAuthorizedError,
  NotFoundError,
  ItemNotFoundError,
  AppError,
  GuruMeditationError
} from 'universe/error';

import type { NextApiRequest, NextApiResponse } from 'next';

jest.mock('universe/backend/request');

const noop = async (_req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).send({});
};

const withMockedEnv = mockEnvFactory(
  {
    REQUESTS_PER_CONTRIVED_ERROR: '0',
    DISABLED_API_VERSIONS: ''
  },
  { replace: false }
);

const wrapHandler = (
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) => {
  const api = async (req: NextApiRequest, res: NextApiResponse) => handler(req, res);
  api.config = middlewareConfig;
  return api;
};

const mockAddToRequestLog = asMockedFunction(addToRequestLog);
const mockIsRateLimited = asMockedFunction(isRateLimited);

beforeEach(() => {
  mockAddToRequestLog.mockReturnValue(Promise.resolve());
  mockIsRateLimited.mockReturnValue(Promise.resolve({ limited: false, retryAfter: 0 }));
});

describe('::handleEndpoint', () => {
  it('rejects requests that are too big when exporting config', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: wrapHandler(withMiddleware(noop, { options: { methods: ['POST'] } })),
      test: async ({ fetch }) => {
        await expect(
          fetch({
            method: 'POST',
            body: Array.from({ length: getEnv().MAX_CONTENT_LENGTH_BYTES + 1 })
              .map(() => 'x')
              .join('')
          }).then((r) => r.status)
        ).resolves.toBe(413);
      }
    });
  });

  it('responds with 501 not implemented if res.send() not called', async () => {
    expect.hasAssertions();

    await testApiHandler({
      requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
      handler: wrapHandler(
        withMiddleware(async () => undefined, { options: { methods: ['GET'] } })
      ),
      test: async ({ fetch }) => expect((await fetch()).status).toBe(501)
    });
  });

  it('responds with 501 not implemented if wrapped handler is undefined', async () => {
    expect.hasAssertions();

    await testApiHandler({
      requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
      handler: wrapHandler(withMiddleware(undefined, { options: { methods: ['GET'] } })),
      test: async ({ fetch }) => expect((await fetch()).status).toBe(501)
    });
  });

  it('logs requests properly', async () => {
    expect.hasAssertions();

    const factory = itemFactory<[ValidHttpMethod, number]>([
      ['GET', 502],
      ['POST', 404],
      ['PUT', 403],
      ['DELETE', 200]
    ]);

    await testApiHandler({
      requestPatcher: (req) => {
        req.headers = {
          ...req.headers,
          'x-forwarded-for': '10.0.0.115',
          key: DUMMY_KEY
        };

        req.url = '/api/v1/handlerX';
      },
      handler: wrapHandler(
        wrapHandler(
          withMiddleware(async (_req, res) => res.status(factory()[1]).send({}), {
            options: {
              methods: factory.items.map(([method]) => method)
            }
          })
        )
      ),
      test: async ({ fetch }) => {
        await Promise.all(
          factory.items.map(([method]) => fetch({ method: method.toString() }))
        );

        expect(mockAddToRequestLog).toBeCalledTimes(factory.count);
      }
    });
  });

  it('sends 405 when encountering unlisted methods', async () => {
    expect.hasAssertions();

    await testApiHandler({
      requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
      handler: wrapHandler(
        withMiddleware(noop, { options: { methods: ['POST', 'PUT'] } })
      ),
      test: async ({ fetch }) => {
        expect((await fetch({ method: 'GET' })).status).toBe(405);
        expect((await fetch({ method: 'POST' })).status).toBe(200);
        expect((await fetch({ method: 'PUT' })).status).toBe(200);
        expect((await fetch({ method: 'DELETE' })).status).toBe(405);
      }
    });
  });

  it('sends 405 when encountering globally disallowed methods', async () => {
    expect.hasAssertions();

    await withMockedEnv(
      async () => {
        await testApiHandler({
          requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
          handler: wrapHandler(
            withMiddleware(noop, {
              options: { methods: ['POST', 'PUT', 'GET', 'DELETE'] }
            })
          ),
          test: async ({ fetch }) => {
            expect((await fetch({ method: 'GET' })).status).toBe(200);
            expect((await fetch({ method: 'POST' })).status).toBe(405);
            expect((await fetch({ method: 'PUT' })).status).toBe(405);
            expect((await fetch({ method: 'DELETE' })).status).toBe(405);
          }
        });
      },
      { DISALLOWED_METHODS: 'POST,PUT,DELETE' }
    );
  });

  it('ignores spacing when parsing DISALLOWED_METHODS', async () => {
    expect.hasAssertions();

    await withMockedEnv(
      async () => {
        await testApiHandler({
          requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
          handler: wrapHandler(
            withMiddleware(noop, {
              options: { methods: ['POST', 'PUT', 'GET', 'DELETE'] }
            })
          ),
          test: async ({ fetch }) => {
            expect((await fetch({ method: 'GET' })).status).toBe(405);
            expect((await fetch({ method: 'POST' })).status).toBe(405);
            expect((await fetch({ method: 'PUT' })).status).toBe(405);
            expect((await fetch({ method: 'DELETE' })).status).toBe(200);
          }
        });
      },
      { DISALLOWED_METHODS: '  POST , PUT,          GET ' }
    );
  });

  it('sends correct HTTP error codes when certain errors occur', async () => {
    expect.hasAssertions();

    const factory = itemFactory<[AppError, number]>([
      [new InvalidIdError(), 400],
      [new InvalidKeyError(), 400],
      [new ValidationError(), 400],
      [new ValidationError(''), 400], // ? Edge case for code coverage
      [new NotAuthorizedError(), 403],
      [new NotFoundError(), 404],
      [new ItemNotFoundError(), 404],
      [new AppError(), 500],
      [new GuruMeditationError(), 500],
      [new Error(), 500]
    ]);

    let expectedStatus: number;
    let expectedError: AppError;

    await testApiHandler({
      requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
      handler: wrapHandler(
        withMiddleware(() => toss(expectedError), { options: { methods: ['GET'] } })
      ),
      test: async ({ fetch }) => {
        for (const item of factory) {
          [expectedError, expectedStatus] = item;
          const res = await fetch();
          expect(res.status).toStrictEqual(expectedStatus);
        }
      }
    });
  });

  it('confirm headers are automatically lowercased', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: wrapHandler(withMiddleware(noop, { options: { methods: ['GET'] } })),
      test: async ({ fetch }) =>
        expect((await fetch({ headers: { KEY: DUMMY_KEY } })).status).toBe(200)
    });
  });

  it('requests limited according to database except when ignoring limits', async () => {
    expect.hasAssertions();

    const ip = '7.7.7.7';
    const key = DUMMY_KEY;

    const runTest = async (
      fetch: Parameters<Parameters<typeof testApiHandler>[0]['test']>[0]['fetch']
    ) =>
      [
        void mockIsRateLimited.mockReturnValue(
          Promise.resolve({ limited: false, retryAfter: 0 })
        ),
        await fetch({ headers: { key } }).then(async (r) => [r.status, await r.json()]),
        void mockIsRateLimited.mockReturnValue(
          Promise.resolve({ limited: true, retryAfter: 100 })
        ),
        await fetch({ headers: { key } }).then(async (r) => [r.status, await r.json()])
      ].filter(Boolean);

    await testApiHandler({
      requestPatcher: (req) => (req.headers['x-forwarded-for'] = ip),
      handler: wrapHandler(withMiddleware(noop, { options: { methods: ['GET'] } })),
      test: async ({ fetch }) => {
        await withMockedEnv(
          async () => {
            const res = await runTest(fetch);

            expect(res).toStrictEqual([
              [200, {}],
              [
                429,
                expect.objectContaining({
                  retryAfter: 100
                })
              ]
            ]);
          },
          { IGNORE_RATE_LIMITS: 'false' }
        );

        await withMockedEnv(
          async () => {
            const res = await runTest(fetch);

            expect(res).toStrictEqual([
              [200, {}],
              [200, {}]
            ]);
          },
          { IGNORE_RATE_LIMITS: 'true' }
        );
      }
    });
  });

  it('does not respond if its corresponding version is disabled', async () => {
    expect.hasAssertions();

    await testApiHandler({
      requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
      handler: wrapHandler(
        withMiddleware(noop, { options: { methods: ['GET'], apiVersion: '1' } })
      ),
      test: async ({ fetch }) => {
        await withMockedEnv(
          async () => {
            expect((await fetch()).status).toBe(404);
          },
          { DISABLED_API_VERSIONS: '1' }
        );

        await withMockedEnv(
          async () => {
            expect((await fetch()).status).toBe(200);
          },
          { DISABLED_API_VERSIONS: '2' }
        );

        await withMockedEnv(
          async () => {
            expect((await fetch()).status).toBe(404);
          },
          { DISABLED_API_VERSIONS: '2,1' }
        );

        await withMockedEnv(
          async () => {
            expect((await fetch()).status).toBe(200);
          },
          { DISABLED_API_VERSIONS: '3,2' }
        );
      }
    });

    await withMockedEnv(
      async () => {
        await testApiHandler({
          requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
          handler: wrapHandler(
            withMiddleware(noop, { options: { methods: ['GET'], apiVersion: '1' } })
          ),
          test: async ({ fetch }) => expect((await fetch()).status).toBe(200)
        });

        await testApiHandler({
          requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
          handler: wrapHandler(
            withMiddleware(noop, { options: { methods: ['GET'], apiVersion: '2' } })
          ),
          test: async ({ fetch }) => expect((await fetch()).status).toBe(404)
        });

        await testApiHandler({
          requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
          handler: wrapHandler(
            withMiddleware(noop, { options: { methods: ['GET'], apiVersion: '3' } })
          ),
          test: async ({ fetch }) => expect((await fetch()).status).toBe(404)
        });

        await testApiHandler({
          requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
          handler: wrapHandler(
            withMiddleware(noop, { options: { methods: ['GET'], apiVersion: '4' } })
          ),
          test: async ({ fetch }) => expect((await fetch()).status).toBe(404)
        });

        await testApiHandler({
          requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
          handler: wrapHandler(
            withMiddleware(noop, { options: { methods: ['GET'], apiVersion: '4' } })
          ),
          test: async ({ fetch }) => expect((await fetch()).status).toBe(404)
        });

        await testApiHandler({
          requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
          handler: wrapHandler(withMiddleware(noop, { options: { methods: ['GET'] } })),
          test: async ({ fetch }) => expect((await fetch()).status).toBe(200)
        });
      },
      { DISABLED_API_VERSIONS: '3,4,2' }
    );

    await withMockedEnv(
      async () => {
        await testApiHandler({
          requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
          handler: wrapHandler(
            withMiddleware(noop, { options: { methods: ['GET'], apiVersion: '1' } })
          ),
          test: async ({ fetch }) => expect((await fetch()).status).toBe(200)
        });

        await testApiHandler({
          requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
          handler: wrapHandler(withMiddleware(noop, { options: { methods: ['GET'] } })),
          test: async ({ fetch }) => expect((await fetch()).status).toBe(200)
        });
      },
      { DISABLED_API_VERSIONS: '' }
    );
  });

  it('parses url parameters as expected', async () => {
    expect.hasAssertions();

    await testApiHandler({
      requestPatcher: (req) => {
        req.url = '/?some=url&yes';
        req.headers.key = DUMMY_KEY;
      },
      handler: wrapHandler(
        withMiddleware(
          async (req, res) => {
            expect(req.query).toStrictEqual({ some: 'url', yes: '' });
            res.status(200).send({});
          },
          { options: { methods: ['GET'] } }
        )
      ),
      test: async ({ fetch }) => {
        expect((await fetch()).status).toBe(200);
      }
    });
  });

  it('handles cors errors gracefully', async () => {
    expect.hasAssertions();

    jest.doMock('cors', () => () => (_: unknown, __: unknown, cb: (e: Error) => void) => {
      return cb(new Error('fake error'));
    });

    let Wrapper = (await isolatedImport(
      'universe/backend/middleware'
    )) as typeof import('universe/backend/middleware');

    await testApiHandler({
      requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
      handler: wrapHandler(
        Wrapper.withMiddleware(noop, { options: { methods: ['GET'] } })
      ),
      test: async ({ fetch }) => expect((await fetch()).status).toBe(500)
    });

    jest.dontMock('cors');

    Wrapper = (await isolatedImport(
      'universe/backend/middleware'
    )) as typeof import('universe/backend/middleware');

    await testApiHandler({
      requestPatcher: (req) => (req.headers.key = DUMMY_KEY),
      handler: wrapHandler(withMiddleware(noop, { options: { methods: ['GET'] } })),
      test: async ({ fetch }) => {
        expect((await fetch()).status).toBe(200);
      }
    });
  });
});
