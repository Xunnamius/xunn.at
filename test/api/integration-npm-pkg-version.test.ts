import Endpoint, {
  config as Config
} from 'universe/pages/api/npm-pkg-version/[...pkgName]';

import { useMockDateNow } from 'multiverse/mongo-common';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { testApiHandler } from 'next-test-api-route-handler';
import { getEnv } from 'multiverse/next-env';

const handler = Endpoint as typeof Endpoint & { config?: typeof Config };
handler.config = Config;

// ? Must use absolute request URLs.
// ? See: https://mswjs.io/docs/getting-started/integrate/node#direct-usage
const server = setupServer(
  rest.get('https://img.shields.io/static/v1', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.body(
        `${req.url.searchParams.get('color')}-${req.url.searchParams.get(
          'label'
        )}-${req.url.searchParams.get('labelColor')}-${req.url.searchParams.get(
          'message'
        )}`
      )
    );
  }),
  rest.get('https://registry.npmjs.com/:package/latest', (req, res, ctx) => {
    if (!['some-pkg', '@some/pkg'].includes(req.params.package.toString())) {
      return res(
        ctx.status(404),
        ctx.set('content-type', 'application/json'),
        ctx.body(JSON.stringify('Not Found'))
      );
    } else {
      return res(
        ctx.status(200),
        ctx.set('content-type', 'application/json'),
        ctx.body(
          JSON.stringify({
            version: req.params.package == 'some-pkg' ? 'x.y.z' : 'w.x.y'
          })
        )
      );
    }
  })
);

setupMemoryServerOverride();
useMockDateNow();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('handles bad requests', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler,
    params: { pkgName: 'some-pkg' },
    test: async ({ fetch }) => {
      const res = await fetch({ method: 'POST' });
      await expect(res.json()).resolves.toMatchObject({ success: false });
      expect(res.status).toBe(405);
    }
  });

  await testApiHandler({
    handler,
    params: { pkgName: 'some-pkg' },
    test: async ({ fetch }) => {
      const res = await fetch({
        method: 'POST',
        body: 'x'.repeat(getEnv().MAX_CONTENT_LENGTH_BYTES + 1)
      });
      expect(res.status).toBe(413);
    }
  });

  await testApiHandler({
    handler,
    params: { pkgName: 'some-pkg' },
    test: async ({ fetch }) => {
      const res = await fetch({ headers: { 'x-forwarded-for': '1.2.3.4' } });
      await expect(res.json()).resolves.toMatchObject({ success: false });
      expect(res.status).toBe(429);
    }
  });
});

it('returns a version badge', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler,
    params: { pkgName: 'some-pkg' },
    test: async ({ fetch }) => {
      const res = await fetch();
      await expect(res.text()).resolves.toMatch(/npm install.*?some-pkg@x\.y\.z/);
      expect(res.status).toBe(200);
    }
  });
});

it('works with namespaced packages', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler,
    params: { pkgName: ['@some', 'pkg'] },
    test: async ({ fetch }) => {
      const res = await fetch();
      await expect(res.text()).resolves.toMatch(/npm install.*?@some\/pkg@w\.x\.y/);
      expect(res.status).toBe(200);
    }
  });
});

it('handles non-existent packages', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler,
    params: { pkgName: 'package-does-not-exist' },
    test: async ({ fetch }) => {
      const res = await fetch();

      await expect(res.text()).resolves.toMatch(/red.*?npm install.*?error/);
      expect(res.status).toBe(200);
    }
  });
});
