import { testApiHandler } from 'next-test-api-route-handler';
import { asMockedFunction } from '@xunnamius/jest-types';
import { isValidAuthHeader } from 'universe/backend/request';
import { noopHandler, wrapHandler } from 'testverse/setup';
import { withMiddleware } from 'multiverse/next-api-glue';
import authRequest, { Options } from 'universe/backend/middleware/auth-request';

jest.mock('universe/backend/request');

const mockIsValidAuthHeader = asMockedFunction(isValidAuthHeader);

beforeEach(() => {
  mockIsValidAuthHeader.mockReturnValue(Promise.resolve(false));
});

it('is a noop by default', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(withMiddleware<Options>(noopHandler, { use: [authRequest] })),
    test: async ({ fetch }) => expect((await fetch()).status).toBe(200)
  });
});

it('sends 401 on requests with bad auth when auth required', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        options: { requiresAuth: true }
      })
    ),
    test: async ({ fetch }) => expect((await fetch()).status).toBe(401)
  });

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        options: { requiresAuth: true }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ headers: { authorization: 'token' } })).status).toBe(401);
    }
  });

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        options: { requiresAuth: false }
      })
    ),
    test: async ({ fetch }) => expect((await fetch()).status).toBe(200)
  });

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        options: { requiresAuth: false }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ headers: { authorization: 'token' } })).status).toBe(200);
    }
  });
});

it('does not send 401 on requests with good auth', async () => {
  expect.hasAssertions();

  mockIsValidAuthHeader.mockReturnValue(Promise.resolve(true));

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        options: { requiresAuth: true }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ headers: { authorization: 'token' } })).status).toBe(200);
    }
  });
});

it('sends 401 if request is missing auth header', async () => {
  expect.hasAssertions();

  mockIsValidAuthHeader.mockReturnValue(Promise.resolve(true));

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        options: { requiresAuth: true }
      })
    ),
    test: async ({ fetch }) => expect((await fetch()).status).toBe(401)
  });
});
