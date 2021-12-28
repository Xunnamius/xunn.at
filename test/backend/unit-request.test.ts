import { WithId } from 'mongodb';
import { BANNED_TOKEN } from 'universe/backend';
import { setupTestDb, dummySystemData } from 'testverse/db';
import { asMockedFunction } from '@xunnamius/jest-types';
import { addToRequestLog, isRateLimited } from 'universe/backend/request';

import type { NextApiRequest, NextApiResponse } from 'next';

import type { HttpStatusCode } from '@xunnamius/types';
import type { InternalRequestLogEntry, InternalLimitedLogEntry } from 'types/global';

const { getDb } = setupTestDb();

describe('::addToRequestLog', () => {
  it('adds request to log as expected', async () => {
    expect.hasAssertions();
    const req1 = {
      headers: { 'x-forwarded-for': '9.9.9.9' },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest;

    const req2 = {
      headers: {
        'x-forwarded-for': '8.8.8.8',
        authorization: `Bearer ${BANNED_TOKEN}`
      },
      method: 'GET',
      url: '/api/route/path2'
    } as unknown as NextApiRequest;

    const res1 = { statusCode: 1111 } as NextApiResponse;
    const res2 = { statusCode: 2222 } as NextApiResponse;

    const now = dummySystemData._generatedAt;
    const _now = Date.now;
    Date.now = () => now;

    await addToRequestLog({ req: req1, res: res1 });
    await addToRequestLog({ req: req2, res: res2 });

    Date.now = _now;

    const reqlog = (await getDb({ name: 'system' })).collection<
      WithId<InternalRequestLogEntry>
    >('request-log');

    const { _id: _, ...log1 } =
      (await reqlog.findOne({ resStatusCode: 1111 as HttpStatusCode })) || {};

    const { _id: __, ...log2 } =
      (await reqlog.findOne({ resStatusCode: 2222 as HttpStatusCode })) || {};

    expect(log1).toStrictEqual({
      ip: '9.9.9.9',
      key: null,
      route: 'route/path1',
      method: 'POST',
      time: now,
      resStatusCode: 1111
    });

    expect(log2).toStrictEqual({
      ip: '8.8.8.8',
      key: BANNED_TOKEN,
      route: 'route/path2',
      method: 'GET',
      time: now,
      resStatusCode: 2222
    });
  });
});

describe('::isRateLimited', () => {
  it('returns true if ip or key are rate limited', async () => {
    expect.hasAssertions();
    const _now = Date.now;
    Date.now = () => dummySystemData._generatedAt;

    const req1 = await isRateLimited({
      headers: { 'x-forwarded-for': '1.2.3.4' },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest);

    const req2 = await isRateLimited({
      headers: {
        'x-forwarded-for': '8.8.8.8',
        authorization: `Bearer ${BANNED_TOKEN}`
      },
      method: 'GET',
      url: '/api/route/path2'
    } as unknown as NextApiRequest);

    const req3 = await isRateLimited({
      headers: {
        'x-forwarded-for': '1.2.3.4',
        authorization: 'Bearerfake-key'
      },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest);

    const req4 = await isRateLimited({
      headers: {
        'x-forwarded-for': '5.6.7.8'
      },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest);

    const req5 = await isRateLimited({
      headers: {
        'x-forwarded-for': '1.2.3.4',
        authorization: `Bearer ${BANNED_TOKEN}`
      },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest);

    expect(req1.limited).toBeTrue();
    expect(req2.limited).toBeTrue();
    expect(req3.limited).toBeTrue();
    expect(req4.limited).toBeTrue();
    expect(req5.limited).toBeTrue();

    const minToMs = (minutes: number) => 1000 * 60 * minutes;
    expect(req1.retryAfter).toBeWithin(minToMs(15) - 1000, minToMs(15) + 1000);
    expect(req2.retryAfter).toBeWithin(minToMs(60) - 1000, minToMs(60) + 1000);
    expect(req3.retryAfter).toBeWithin(minToMs(15) - 1000, minToMs(15) + 1000);
    expect(req4.retryAfter).toBeWithin(minToMs(15) - 1000, minToMs(15) + 1000);
    // ? Should return greater of the two ban times (key time > ip time)
    expect(req5.retryAfter).toBeWithin(minToMs(60) - 1000, minToMs(60) + 1000);

    Date.now = _now;
  });

  it('returns false iff both ip and key (if provided) are not rate limited', async () => {
    expect.hasAssertions();
    const req1 = {
      headers: { 'x-forwarded-for': '1.2.3.5' },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest;

    const req2 = {
      headers: {
        'x-forwarded-for': '8.8.8.8',
        authorization: 'Bearerfake-key'
      },
      method: 'GET',
      url: '/api/route/path2'
    } as unknown as NextApiRequest;

    await expect(isRateLimited(req1)).resolves.toStrictEqual({
      limited: false,
      retryAfter: 0
    });
    await expect(isRateLimited(req2)).resolves.toStrictEqual({
      limited: false,
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

    await expect(isRateLimited(req)).resolves.toContainEntry(['limited', true]);

    await (await getDb({ name: 'system' }))
      .collection<InternalLimitedLogEntry>('limited-log-mview')
      .updateOne({ ip: '1.2.3.4' }, { $set: { until: Date.now() - 10 ** 5 } });

    await expect(isRateLimited(req)).resolves.toStrictEqual({
      limited: false,
      retryAfter: 0
    });
  });
});
