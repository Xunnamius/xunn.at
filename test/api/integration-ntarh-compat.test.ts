import Endpoint, { config as Config } from 'universe/pages/api/ntarh-compat';
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
  rest.all(/^http:\/\/localhost:\d+/, () => undefined),
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
  })
);

setupMemoryServerOverride();
useMockDateNow();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  // eslint-disable-next-line no-console
  const warn = console.warn.bind(console);
  jest.spyOn(console, 'warn').mockImplementation(
    // ? Silence annoying useless warnings from MSW.
    // ? See: https://github.com/mswjs/msw/issues/676
    // TODO: remove this after upstream fixes it
    (...args) => String(args[0]).startsWith('[MSW]') || warn(...args)
  );
});

afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('handles bad requests', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler,
    test: async ({ fetch }) => {
      const res = await fetch({ method: 'POST' });
      await expect(res.json()).resolves.toMatchObject({ success: false });
      expect(res.status).toBe(405);
    }
  });

  await testApiHandler({
    handler,
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
    test: async ({ fetch }) => {
      const res = await fetch({ headers: { 'x-forwarded-for': '1.2.3.4' } });
      await expect(res.json()).resolves.toMatchObject({ success: false });
      expect(res.status).toBe(429);
    }
  });
});

it('returns a compat badge', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler,
    test: async ({ fetch }) => {
      const res = await fetch();
      await expect(res.text()).resolves.toMatch(/compatible with.*?next@.*?5\.7\.9/);
      expect(res.status).toBe(200);
    }
  });
});
