import { testApiHandler } from 'next-test-api-route-handler';
import { noopHandler, wrapHandler, mockEnvFactory } from 'testverse/setup';
import { withMiddleware } from 'multiverse/next-api-glue';
import checkMethod, { Options } from 'universe/backend/middleware/check-method';

const withMockedEnv = mockEnvFactory({}, { replace: false });

it('is a noop by default', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(withMiddleware<Options>(noopHandler, { use: [checkMethod] })),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'GET' })).status).toBe(200);
      expect((await fetch({ method: 'POST' })).status).toBe(200);
      expect((await fetch({ method: 'PUT' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
    }
  });
});

it('sends 405 when request.method is undefined', async () => {
  expect.hasAssertions();

  await testApiHandler({
    requestPatcher: (req) => (req.method = undefined),
    handler: wrapHandler(withMiddleware<Options>(noopHandler, { use: [checkMethod] })),
    test: async ({ fetch }) => {
      expect((await fetch()).status).toBe(405);
    }
  });
});

it('sends 405 when encountering unlisted methods', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkMethod],
        options: { allowedMethods: ['POST', 'PUT'] }
      })
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
        handler: wrapHandler(
          withMiddleware<Options>(noopHandler, { use: [checkMethod] })
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
        handler: wrapHandler(
          withMiddleware<Options>(noopHandler, { use: [checkMethod] })
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
