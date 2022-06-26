import { dummyRootData, useMockDateNow } from 'multiverse/mongo-common';
import { getDb } from 'multiverse/mongo-schema';
import { BANNED_BEARER_TOKEN } from 'multiverse/next-auth';
import { clientIsRateLimited, removeRateLimit } from 'multiverse/next-limit';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';

import type { InternalLimitedLogEntry } from 'multiverse/next-limit';
import type { NextApiRequest } from 'next';

setupMemoryServerOverride();
useMockDateNow();

describe('::clientIsRateLimited', () => {
  it('returns true if ip or header (case-insensitive) are rate limited', async () => {
    expect.hasAssertions();

    const req1 = await clientIsRateLimited({
      headers: { 'x-forwarded-for': '1.2.3.4' },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest);

    const req2 = await clientIsRateLimited({
      headers: {
        'x-forwarded-for': '8.8.8.8',
        // ? Should work with different cases too
        authorization: `BEARER ${BANNED_BEARER_TOKEN}`
      },
      method: 'GET',
      url: '/api/route/path2'
    } as unknown as NextApiRequest);

    const req3 = await clientIsRateLimited({
      headers: {
        'x-forwarded-for': '1.2.3.4',
        authorization: 'bearer fake-header'
      },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest);

    const req4 = await clientIsRateLimited({
      headers: {
        'x-forwarded-for': '5.6.7.8'
      },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest);

    const req5 = await clientIsRateLimited({
      headers: {
        'x-forwarded-for': '1.2.3.4',
        authorization: `bearer ${BANNED_BEARER_TOKEN}`
      },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest);

    const req6 = await clientIsRateLimited({
      headers: {
        // ? Should work with different cases too
        authorization: `bEaReR ${BANNED_BEARER_TOKEN}`
      },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest);

    expect(req1.isLimited).toBeTrue();
    expect(req2.isLimited).toBeTrue();
    expect(req3.isLimited).toBeTrue();
    expect(req4.isLimited).toBeTrue();
    expect(req5.isLimited).toBeTrue();
    expect(req6.isLimited).toBeTrue();

    const minToMs = (minutes: number) => 1000 * 60 * minutes;
    expect(req1.retryAfter).toBeWithin(minToMs(15) - 1000, minToMs(15) + 1000);
    expect(req2.retryAfter).toBeWithin(minToMs(60) - 1000, minToMs(60) + 1000);
    expect(req3.retryAfter).toBeWithin(minToMs(15) - 1000, minToMs(15) + 1000);
    expect(req4.retryAfter).toBeWithin(minToMs(15) - 1000, minToMs(15) + 1000);
    // ? Should return greater of the two ban times (header time > ip time)
    expect(req5.retryAfter).toBeWithin(minToMs(60) - 1000, minToMs(60) + 1000);
    expect(req6.retryAfter).toBeWithin(minToMs(60) - 1000, minToMs(60) + 1000);
  });

  it('returns false if both ip and header (if provided) are not rate limited', async () => {
    expect.hasAssertions();
    const req1 = {
      headers: { 'x-forwarded-for': '1.2.3.5' },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest;

    const req2 = {
      headers: {
        'x-forwarded-for': '8.8.8.8',
        authorization: 'bearer fake-header'
      },
      method: 'GET',
      url: '/api/route/path2'
    } as unknown as NextApiRequest;

    await expect(clientIsRateLimited(req1)).resolves.toStrictEqual({
      isLimited: false,
      retryAfter: 0
    });
    await expect(clientIsRateLimited(req2)).resolves.toStrictEqual({
      isLimited: false,
      retryAfter: 0
    });
  });

  it('returns false if "until" time has passed', async () => {
    expect.hasAssertions();

    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4' },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest;

    await expect(clientIsRateLimited(req)).resolves.toStrictEqual({
      isLimited: true,
      retryAfter: expect.any(Number)
    });

    await (await getDb({ name: 'root' }))
      .collection<InternalLimitedLogEntry>('limited-log')
      .updateOne({ ip: '1.2.3.4' }, { $set: { until: Date.now() - 10 ** 5 } });

    await expect(clientIsRateLimited(req)).resolves.toStrictEqual({
      isLimited: false,
      retryAfter: 0
    });
  });
});

describe('::removeRateLimit', () => {
  it('removes an active rate limit by ip, header', async () => {
    expect.hasAssertions();

    const db = (await getDb({ name: 'root' })).collection('limited-log');

    await expect(
      db.countDocuments({
        ip: dummyRootData['limited-log'][0].ip,
        until: { $gt: Date.now() }
      })
    ).resolves.toBe(1);

    await expect(
      removeRateLimit({ target: { ip: dummyRootData['limited-log'][0].ip } })
    ).resolves.toBe(1);

    await expect(
      db.countDocuments({
        ip: dummyRootData['limited-log'][0].ip,
        until: { $gt: Date.now() }
      })
    ).resolves.toBe(0);

    await expect(
      db.countDocuments({
        header: dummyRootData['limited-log'][2].header,
        until: { $gt: Date.now() }
      })
    ).resolves.toBe(1);

    await expect(
      removeRateLimit({ target: { header: dummyRootData['limited-log'][2].header } })
    ).resolves.toBe(1);

    await expect(
      db.countDocuments({
        header: dummyRootData['limited-log'][2].header,
        until: { $gt: Date.now() }
      })
    ).resolves.toBe(0);
  });

  it('removes an active rate limit by ip or header (simultaneously)', async () => {
    expect.hasAssertions();

    const db = (await getDb({ name: 'root' })).collection('limited-log');

    await expect(
      db.countDocuments({
        $or: [
          { ip: dummyRootData['limited-log'][1].ip },
          { header: dummyRootData['limited-log'][2].header }
        ],
        until: { $gt: Date.now() }
      })
    ).resolves.toBe(2);

    await expect(
      removeRateLimit({
        target: {
          ip: dummyRootData['limited-log'][1].ip,
          header: dummyRootData['limited-log'][2].header
        }
      })
    ).resolves.toBe(2);

    await expect(
      db.countDocuments({
        $or: [
          { ip: dummyRootData['limited-log'][1].ip },
          { header: dummyRootData['limited-log'][2].header }
        ],
        until: { $gt: Date.now() }
      })
    ).resolves.toBe(0);
  });

  it('only removes active rate limits', async () => {
    expect.hasAssertions();

    const db = (await getDb({ name: 'root' })).collection('limited-log');

    await db.updateOne(
      { ip: dummyRootData['limited-log'][1].ip },
      { $set: { until: Date.now() } }
    );

    await expect(
      removeRateLimit({
        target: {
          ip: dummyRootData['limited-log'][1].ip,
          header: dummyRootData['limited-log'][2].header
        }
      })
    ).resolves.toBe(1);
  });

  it('returns 0 if no active rate limit was found', async () => {
    expect.hasAssertions();

    const db = (await getDb({ name: 'root' })).collection('limited-log');

    await db.updateOne(
      { ip: dummyRootData['limited-log'][1].ip },
      { $set: { until: Date.now() } }
    );

    await expect(
      removeRateLimit({ target: { ip: dummyRootData['limited-log'][1].ip } })
    ).resolves.toBe(0);
  });

  it('rejects if passed invalid data', async () => {
    expect.hasAssertions();
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(removeRateLimit({} as any)).rejects.toMatchObject({
        message: 'must provide either an ip or a header'
      }),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(removeRateLimit({ something: 'else' } as any)).rejects.toMatchObject({
        message: 'must provide either an ip or a header'
      }),

      expect(removeRateLimit({ target: undefined })).rejects.toMatchObject({
        message: 'must provide either an ip or a header'
      }),

      expect(removeRateLimit({ target: {} })).rejects.toMatchObject({
        message: 'must provide either an ip or a header'
      }),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(removeRateLimit({ target: { ip: true } } as any)).rejects.toMatchObject({
        message: 'ip must be a non-empty string'
      }),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(removeRateLimit({ target: { header: true } as any })).rejects.toMatchObject({
        message: 'header must be a non-empty string'
      }),

      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        removeRateLimit({ target: { ip: '', header: true } as any })
      ).rejects.toMatchObject({
        message: 'ip must be a non-empty string'
      }),

      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        removeRateLimit({ target: { ip: null, header: '' } as any })
      ).rejects.toMatchObject({
        message: 'ip must be a non-empty string'
      }),

      expect(
        removeRateLimit({ target: { ip: undefined, header: undefined } })
      ).rejects.toMatchObject({ message: 'must provide either an ip or a header' }),
      expect(removeRateLimit({ target: { ip: '', header: '' } })).rejects.toMatchObject({
        message: 'ip must be a non-empty string'
      })
    ]);
  });
});
