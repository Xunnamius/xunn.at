/* eslint-disable no-global-assign */
import { testApiHandler } from 'next-test-api-route-handler';
import Endpoint, { config as Config } from 'universe/pages/api/ping';

const handler = Endpoint as typeof Endpoint & { config?: typeof Config };
handler.config = Config;

it('adds request to log as expected', async () => {
  expect.hasAssertions();

  const oldDate = Date;
  // @ts-expect-error: overriding Date is tough stuff
  Date = class extends Date {
    constructor(...args: Parameters<typeof Date>) {
      super(...args);
    }

    toLocaleString(): string;
    toLocaleString(
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ): string;
    toLocaleString(locales?: unknown, options?: unknown): string {
      void locales, options;
      return 'fake date, fake time';
    }
  };

  await testApiHandler({
    handler,
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toStrictEqual({
        success: true,
        message: 'Hello to Mr. World at fake date, fake time'
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
        message: 'Hello to Ms. Universe at fake date, fake time'
      });
    }
  });

  Date = oldDate;
});
