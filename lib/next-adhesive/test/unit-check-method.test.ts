import { testApiHandler } from 'next-test-api-route-handler';
import { noopHandler, wrapHandler, mockEnvFactory } from 'testverse/setup';
import { withMiddleware } from 'multiverse/next-api-glue';
import checkMethod, { Options } from 'multiverse/next-adhesive/check-method';

import type { ValidHttpMethod } from '@xunnamius/types';

const withMockedEnv = mockEnvFactory({ NODE_ENV: 'test' });

it('sends 200 for allowed methods', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkMethod],
        options: { allowedMethods: ['GET', 'DELETE', 'POST', 'PUT'] }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'GET' })).status).toBe(200);
      expect((await fetch({ method: 'POST' })).status).toBe(200);
      expect((await fetch({ method: 'PUT' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
    }
  });
});

it('is restrictive by default', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, { use: [checkMethod] })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'GET' })).status).toBe(405);
      expect((await fetch({ method: 'POST' })).status).toBe(405);
      expect((await fetch({ method: 'PUT' })).status).toBe(405);
      expect((await fetch({ method: 'DELETE' })).status).toBe(405);
    }
  });
});

it('sends 405 when request.method is undefined', async () => {
  expect.hasAssertions();

  await testApiHandler({
    requestPatcher: (req) => (req.method = undefined),
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, { use: [checkMethod] })
    ),
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
          withMiddleware<Options>(noopHandler, {
            use: [checkMethod],
            options: { allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'] }
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
        handler: wrapHandler(
          withMiddleware<Options>(noopHandler, {
            use: [checkMethod],
            options: { allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'] }
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

it('sends an Allow header in 405 responses', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkMethod],
        options: { allowedMethods: ['GET', 'POST', 'HEAD'] }
      })
    ),
    test: async ({ fetch }) => {
      const res = await fetch({ method: 'PUT' });
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('GET,POST,HEAD');
    }
  });
});

it('works even if allowedMethods specified in lowercase', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkMethod],
        options: {
          allowedMethods: ['get'] as unknown as ValidHttpMethod[]
        }
      })
    ),
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
    }
  });
});
