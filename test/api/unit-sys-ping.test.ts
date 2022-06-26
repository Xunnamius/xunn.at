/* eslint-disable no-global-assign */
import { useMockDateNow } from 'multiverse/jest-mock-date';
import { getDb } from 'multiverse/mongo-schema';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { BANNED_BEARER_TOKEN, DUMMY_BEARER_TOKEN } from 'multiverse/next-auth';
import { testApiHandler } from 'next-test-api-route-handler';

import Endpoint, { config as Config } from 'universe/pages/api/sys/ping';

import type { InternalAuthBearerEntry, TokenAttributes } from 'multiverse/next-auth';

const handler = Endpoint as typeof Endpoint & { config?: typeof Config };
handler.config = Config;

setupMemoryServerOverride();
useMockDateNow();

// * This suite blurs the line between unit and integration tests for portability
// * reasons.
// TODO: replace with next-fable (formerly / in addition to: @xunnamius/fable)

describe('middleware correctness tests', () => {
  it('endpoints is not authenticated', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler,
      test: async ({ fetch }) => {
        await expect(fetch().then((r) => r.status)).resolves.toBe(200);
      }
    });
  });

  it('endpoints ignores authentication and authorization header', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler,
      test: async ({ fetch }) => {
        await expect(
          fetch({
            headers: { Authorization: `bearer ${DUMMY_BEARER_TOKEN}` }
          }).then((r) => r.status)
        ).resolves.toBe(200);
      }
    });
  });

  it('endpoint fails if req is rate limited', async () => {
    expect.hasAssertions();

    await (await getDb({ name: 'root' }))
      .collection<InternalAuthBearerEntry>('auth')
      .updateOne(
        { token: { bearer: BANNED_BEARER_TOKEN } },
        { $set: { attributes: { isGlobalAdmin: true } as TokenAttributes } }
      );

    await testApiHandler({
      handler,
      test: async ({ fetch }) => {
        await expect(
          fetch({
            headers: { Authorization: `bearer ${BANNED_BEARER_TOKEN}` }
          }).then((r) => r.status)
        ).resolves.toBe(429);
      }
    });
  });
});

describe('api/sys/ping', () => {
  it('pongs when we ping', async () => {
    expect.hasAssertions();

    const oldDate = Date;

    try {
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
    } finally {
      Date = oldDate;
    }
  });
});
