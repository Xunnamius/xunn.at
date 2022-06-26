import { useMockDateNow } from 'multiverse/mongo-common';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { testApiHandler } from 'next-test-api-route-handler';
import Endpoint, { config as Config } from 'universe/pages/api/sys/ping';

const handler = Endpoint as typeof Endpoint & { config?: typeof Config };
handler.config = Config;

setupMemoryServerOverride();
useMockDateNow();

it('pongs when we ping', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler,
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toStrictEqual({
        success: true,
        message: expect.stringContaining(
          `Hello to Mr. World at ${new Date().toLocaleString(undefined, {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric'
          })},`
        )
      });
    }
  });

  await testApiHandler({
    handler,
    params: { name: 'Ms. Universe' },
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toStrictEqual({
        success: true,
        message: expect.stringContaining(
          `Hello to Ms. Universe at ${new Date().toLocaleString(undefined, {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric'
          })},`
        )
      });
    }
  });
});
