import { testApiHandler } from 'next-test-api-route-handler';
import { asMockedFunction } from '@xunnamius/jest-types';
import { isRateLimited } from 'universe/backend/request';
import { withMiddleware } from 'multiverse/next-api-glue';
import { mockEnvFactory, wrapHandler, noopHandler } from 'testverse/setup';
import limitRequest from 'universe/backend/middleware/limit-request';

jest.mock('universe/backend/request');

const withMockedEnv = mockEnvFactory({}, { replace: false });
const mockIsRateLimited = asMockedFunction(isRateLimited);

beforeEach(() => {
  mockIsRateLimited.mockReturnValue(Promise.resolve({ limited: false, retryAfter: 0 }));
});

it('rate limits requests according to backend determination', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(withMiddleware(noopHandler, { use: [limitRequest] })),
    test: async ({ fetch }) => {
      await withMockedEnv(
        async () => {
          void mockIsRateLimited.mockReturnValue(
            Promise.resolve({ limited: false, retryAfter: 0 })
          );

          await expect(
            fetch().then(async (r) => [r.status, await r.json()])
          ).resolves.toStrictEqual([200, {}]);

          void mockIsRateLimited.mockReturnValue(
            Promise.resolve({ limited: true, retryAfter: 100 })
          );

          await expect(
            fetch().then(async (r) => [r.status, await r.json()])
          ).resolves.toStrictEqual([
            429,
            expect.objectContaining({
              retryAfter: 100
            })
          ]);
        },
        { IGNORE_RATE_LIMITS: 'false' }
      );
    }
  });
});

it('does not rate limit requests when ignoring rate limits', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(withMiddleware(noopHandler, { use: [limitRequest] })),
    test: async ({ fetch }) => {
      await withMockedEnv(
        async () => {
          void mockIsRateLimited.mockReturnValue(
            Promise.resolve({ limited: false, retryAfter: 0 })
          );

          await expect(
            fetch().then(async (r) => [r.status, await r.json()])
          ).resolves.toStrictEqual([200, {}]);

          void mockIsRateLimited.mockReturnValue(
            Promise.resolve({ limited: true, retryAfter: 100 })
          );

          await expect(
            fetch().then(async (r) => [r.status, await r.json()])
          ).resolves.toStrictEqual([200, {}]);
        },
        { IGNORE_RATE_LIMITS: 'true' }
      );
    }
  });
});

it('treats otherwise valid requests as unauthenticatable only when locking out all clients', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(withMiddleware(noopHandler, { use: [limitRequest] })),
    test: async ({ fetch }) => {
      await withMockedEnv(async () => expect((await fetch()).status).toBe(401), {
        LOCKOUT_ALL_CLIENTS: 'true'
      });

      await withMockedEnv(async () => expect((await fetch()).status).toBe(200), {
        LOCKOUT_ALL_CLIENTS: 'false'
      });
    }
  });
});
