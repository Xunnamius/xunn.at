import { useMockDateNow, mockDateNowMs } from 'multiverse/mongo-common';
import { getDb } from 'multiverse/mongo-schema';
import { BANNED_BEARER_TOKEN } from 'multiverse/next-auth';
import { addToRequestLog } from 'multiverse/next-log';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';

import type { InternalRequestLogEntry } from 'multiverse/next-log';
import type { HttpStatusCode } from '@xunnamius/types';
import type { NextApiRequest, NextApiResponse } from 'next';

setupMemoryServerOverride();
useMockDateNow();

describe('::addToRequestLog', () => {
  it('adds request to mongo collection', async () => {
    expect.hasAssertions();

    const req1 = {
      headers: { 'x-forwarded-for': '9.9.9.9' },
      method: 'POST',
      url: '/api/route/path1'
    } as unknown as NextApiRequest;

    const req2 = {
      headers: {
        'x-forwarded-for': '8.8.8.8',
        authorization: `bearer ${BANNED_BEARER_TOKEN}`
      },
      method: 'GET',
      url: '/api/route/path2'
    } as unknown as NextApiRequest;

    const res1 = { statusCode: 1111 } as NextApiResponse;
    const res2 = { statusCode: 2222 } as NextApiResponse;

    await addToRequestLog({ req: req1, res: res1 });
    await addToRequestLog({ req: req2, res: res2 });

    const reqlog = (await getDb({ name: 'root' })).collection<InternalRequestLogEntry>(
      'request-log'
    );

    await expect(
      reqlog.findOne({ resStatusCode: 1111 as HttpStatusCode })
    ).resolves.toStrictEqual({
      _id: expect.anything(),
      ip: '9.9.9.9',
      header: null,
      route: '/api/route/path1',
      method: 'POST',
      createdAt: mockDateNowMs,
      resStatusCode: 1111
    });

    await expect(
      reqlog.findOne({ resStatusCode: 2222 as HttpStatusCode })
    ).resolves.toStrictEqual({
      _id: expect.anything(),
      ip: '8.8.8.8',
      header: `bearer ${BANNED_BEARER_TOKEN}`,
      route: '/api/route/path2',
      method: 'GET',
      createdAt: mockDateNowMs,
      resStatusCode: 2222
    });
  });

  it('handles null method and/or url and lowercases schema', async () => {
    expect.hasAssertions();

    const req1 = {
      headers: { 'x-forwarded-for': '9.9.9.9' },
      method: null,
      url: '/api/route/path1'
    } as unknown as NextApiRequest;

    const req2 = {
      headers: {
        'x-forwarded-for': '8.8.8.8',
        authorization: `BeArEr ${BANNED_BEARER_TOKEN}`
      },
      method: 'GET',
      url: null
    } as unknown as NextApiRequest;

    const res1 = { statusCode: 1111 } as NextApiResponse;
    const res2 = { statusCode: 2222 } as NextApiResponse;

    await addToRequestLog({ req: req1, res: res1 });
    await addToRequestLog({ req: req2, res: res2 });

    const reqlog = (await getDb({ name: 'root' })).collection<InternalRequestLogEntry>(
      'request-log'
    );

    await expect(
      reqlog.findOne({ resStatusCode: 1111 as HttpStatusCode })
    ).resolves.toStrictEqual({
      _id: expect.anything(),
      ip: '9.9.9.9',
      header: null,
      route: '/api/route/path1',
      method: null,
      createdAt: mockDateNowMs,
      resStatusCode: 1111
    });

    await expect(
      reqlog.findOne({ resStatusCode: 2222 as HttpStatusCode })
    ).resolves.toStrictEqual({
      _id: expect.anything(),
      ip: '8.8.8.8',
      header: `bearer ${BANNED_BEARER_TOKEN}`,
      route: null,
      method: 'GET',
      createdAt: mockDateNowMs,
      resStatusCode: 2222
    });
  });
});
