import { testApiHandler } from 'next-test-api-route-handler';
import { withMiddleware } from 'universe/backend/middleware';
import { asMockedFunction } from '@xunnamius/jest-types';
import { mockEnvFactory, wrapHandler, noopHandler } from 'testverse/setup';
import { addToRequestLog, isRateLimited } from 'universe/backend/request';

jest.mock('universe/backend/request');

const mockIsRateLimited = asMockedFunction(isRateLimited);
const mockAddToRequestLog = asMockedFunction(addToRequestLog);

beforeEach(() => {
  mockIsRateLimited.mockReturnValue(Promise.resolve({ limited: false, retryAfter: 0 }));
  mockAddToRequestLog.mockReturnValue(Promise.resolve());
});

const withMockedEnv = mockEnvFactory({}, { replace: false });

it('treats requests as unauthenticatable when locking out all clients', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware(noopHandler, { options: { allowedMethods: ['GET'] } })
    ),
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
