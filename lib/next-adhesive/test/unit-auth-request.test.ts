import { testApiHandler } from 'next-test-api-route-handler';
import { asMockedFunction } from '@xunnamius/jest-types';
import { authenticateHeader, authorizeHeader } from 'multiverse/next-auth';
import { noopHandler, wrapHandler } from 'testverse/setup';
import { withMiddleware } from 'multiverse/next-api-glue';
import authRequest, { Options } from 'multiverse/next-adhesive/auth-request';

jest.mock('multiverse/next-auth');

const mockAuthenticateHeader = asMockedFunction(authenticateHeader);
const mockAuthorizeHeader = asMockedFunction(authorizeHeader);

beforeEach(() => {
  mockAuthenticateHeader.mockReturnValue(Promise.resolve({ authenticated: false }));
  mockAuthorizeHeader.mockReturnValue(Promise.resolve({ authorized: false }));
});

it('throws if missing requiresAuth option', async () => {
  expect.hasAssertions();

  await testApiHandler({
    rejectOnHandlerError: true,
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        useOnError: [
          (_, res, ctx) => {
            expect(ctx.runtime.error).toMatchObject({
              message: expect.stringContaining(
                'a valid "requiresAuth" option is missing from middleware configuration'
              )
            });
            res.send(200);
          }
        ]
      })
    ),
    test: async ({ fetch }) => void (await fetch())
  });

  await testApiHandler({
    rejectOnHandlerError: true,
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        useOnError: [
          (_, res, ctx) => {
            expect(ctx.runtime.error).toMatchObject({
              message: expect.stringContaining(
                'a valid "requiresAuth" option is missing from middleware configuration'
              )
            });
            res.send(200);
          }
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options: { requiresAuth: 'isGlobalAdmin' as any }
      })
    ),
    test: async ({ fetch }) => void (await fetch())
  });
});

it('passes allowedSchemes to authenticateHeader', async () => {
  expect.hasAssertions();

  mockAuthenticateHeader.mockReturnValue(Promise.resolve({ authenticated: true }));

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        options: { requiresAuth: { allowedSchemes: 'bearer' } }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ headers: { authorization: 'token' } })).status).toBe(200);
      expect(mockAuthenticateHeader).toBeCalledWith({
        header: 'token',
        allowedSchemes: 'bearer'
      });
    }
  });
});

it('passes constraints to authorizeHeader', async () => {
  expect.hasAssertions();

  mockAuthenticateHeader.mockReturnValue(Promise.resolve({ authenticated: true }));
  mockAuthorizeHeader.mockReturnValue(Promise.resolve({ authorized: true }));

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        options: { requiresAuth: { constraints: ['isGlobalAdmin'] } }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ headers: { authorization: 'token' } })).status).toBe(200);
      expect(mockAuthorizeHeader).toBeCalledWith({
        header: 'token',
        constraints: ['isGlobalAdmin']
      });
    }
  });
});

it('does not send 401 if requires auth and authenticateHeader returns ok', async () => {
  expect.hasAssertions();

  mockAuthenticateHeader.mockReturnValue(Promise.resolve({ authenticated: true }));

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

it('sends 401 if requires auth and authenticateHeader returns not-ok or error', async () => {
  expect.hasAssertions();

  mockAuthenticateHeader.mockReturnValue(Promise.resolve({ authenticated: false }));

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
        options: { requiresAuth: false }
      })
    ),
    test: async ({ fetch }) => expect((await fetch()).status).toBe(200)
  });

  mockAuthenticateHeader.mockReturnValue(
    Promise.resolve({ authenticated: true, error: 'some error' })
  );

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

it('does not send 403 if requires auth and authorizeHeader returns ok', async () => {
  expect.hasAssertions();

  mockAuthenticateHeader.mockReturnValue(Promise.resolve({ authenticated: true }));
  mockAuthorizeHeader.mockReturnValue(Promise.resolve({ authorized: true }));

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        options: { requiresAuth: { constraints: ['isGlobalAdmin'] } }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ headers: { authorization: 'token' } })).status).toBe(200);
      expect(mockAuthenticateHeader).toBeCalledTimes(1);
      expect(mockAuthorizeHeader).toBeCalledTimes(1);
    }
  });
});

it('sends 403 if requires auth and authorizeHeader returns ok or error', async () => {
  expect.hasAssertions();

  mockAuthenticateHeader.mockReturnValue(Promise.resolve({ authenticated: true }));
  mockAuthorizeHeader.mockReturnValue(Promise.resolve({ authorized: false }));

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        options: { requiresAuth: { constraints: 'isGlobalAdmin' } }
      })
    ),
    test: async ({ fetch }) => expect((await fetch()).status).toBe(403)
  });

  mockAuthorizeHeader.mockReturnValue(
    Promise.resolve({ authorized: true, error: 'an error' })
  );

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [authRequest],
        options: { requiresAuth: { constraints: 'isGlobalAdmin' } }
      })
    ),
    test: async ({ fetch }) => expect((await fetch()).status).toBe(403)
  });
});
