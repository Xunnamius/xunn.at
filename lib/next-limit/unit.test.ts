import { useMockDateNow } from 'multiverse/mongo-common';
import { getDb } from 'multiverse/mongo-schema';
import { BANNED_BEARER_TOKEN } from 'multiverse/next-auth';
import { clientIsRateLimited } from 'multiverse/next-limit';
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
