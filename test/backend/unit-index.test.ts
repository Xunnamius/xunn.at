import { toss } from 'toss-expression';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { testApiHandler } from 'next-test-api-route-handler';
import { asMockedFunction } from '@xunnamius/jest-types';

import { DummyError } from 'universe/error';

import {
  resolveShortId,
  getCompatVersion,
  getNpmPackageVersion,
  sendBadgeSvgResponse
} from 'universe/backend';

import { getDb } from 'multiverse/mongo-schema';
import { useMockDateNow } from 'multiverse/mongo-common';
import { jsonFetch } from 'multiverse/json-node-fetch';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';

import { dummyAppData, dummyCompatData } from 'testverse/db';

import type { WithId } from 'mongodb';
import type { InternalLinkMapEntry } from 'universe/backend/db';

jest.mock('multiverse/json-node-fetch');

const mockJsonFetch = asMockedFunction(jsonFetch);
const server = setupServer();

setupMemoryServerOverride();
useMockDateNow();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('::resolveShortId', () => {
  it('throws if short link id not found', async () => {
    expect.hasAssertions();

    await expect(resolveShortId({ shortId: 'does-not-exist' })).rejects.toThrow(
      'short-id "does-not-exist" was not found'
    );
  });

  it('returns expected result conditioned on type', async () => {
    expect.hasAssertions();

    const entryToReturnValue = (entry: WithId<InternalLinkMapEntry>) => {
      const { _id: _, shortId: __, createdAt: ___, ...shortData } = entry;
      return shortData;
    };

    // * uri type
    await expect(resolveShortId({ shortId: 'aaa' })).resolves.toStrictEqual(
      entryToReturnValue(dummyAppData['link-map'][0])
    );

    // * file type
    await expect(resolveShortId({ shortId: 'bbb' })).resolves.toStrictEqual(
      entryToReturnValue(dummyAppData['link-map'][1])
    );

    // * badge type
    await expect(resolveShortId({ shortId: 'ccc' })).resolves.toStrictEqual(
      entryToReturnValue(dummyAppData['link-map'][2])
    );

    // * github-pkg type

    const shortData = resolveShortId({ shortId: 'ddd' });

    await expect(shortData).resolves.toStrictEqual({
      ...entryToReturnValue(dummyAppData['link-map'][3]),
      pseudoFilename: expect.any(Function)
    });

    ((d) =>
      d.type == 'github-pkg' &&
      // eslint-disable-next-line jest/no-conditional-expect
      expect(d.pseudoFilename('c@o+m_m i/t-1')).toBe(
        `${d.owner}-${d.repo}-c-o-m-m-i-t-1.tgz`
      ))(await shortData);
  });
});

describe('::getCompatVersion', () => {
  it('returns the latest compat version depending on flag name', async () => {
    expect.hasAssertions();

    await expect(getCompatVersion()).resolves.toBe(dummyCompatData.flags[0].value);

    await (await getDb({ name: 'pkg-compat' }))
      .collection('flags')
      .updateOne({ name: 'ntarh-next' }, { $set: { value: 5 } });

    await expect(getCompatVersion()).resolves.toBe(5);

    await (await getDb({ name: 'pkg-compat' }))
      .collection('flags')
      .updateOne({ name: 'ntarh-next' }, { $set: { value: null } });

    await expect(getCompatVersion()).resolves.toBeNull();

    await (await getDb({ name: 'pkg-compat' }))
      .collection('flags')
      .deleteOne({ name: 'ntarh-next' });

    await expect(getCompatVersion()).resolves.toBeNull();
  });
});

describe('::getNpmPackageVersion', () => {
  it('gets latest package version from npm registry', async () => {
    expect.hasAssertions();

    mockJsonFetch.mockImplementationOnce(
      () =>
        Promise.resolve({ json: { version: 'd.e.f' } }) as unknown as ReturnType<
          typeof jsonFetch
        >
    );

    await expect(getNpmPackageVersion('some-package')).resolves.toBe('d.e.f');
  });

  it('returns null if fetch fails or does not return expected body', async () => {
    expect.hasAssertions();

    mockJsonFetch.mockImplementationOnce(
      () => Promise.resolve({ json: {} }) as unknown as ReturnType<typeof jsonFetch>
    );

    mockJsonFetch.mockImplementationOnce(() => toss(new DummyError()));

    await expect(getNpmPackageVersion('some-package')).resolves.toBeNull();
    await expect(getNpmPackageVersion('some-package')).rejects.toThrowError(
      DummyError
    );
  });

  it('rejects if fetch fails', async () => {
    expect.hasAssertions();

    mockJsonFetch.mockImplementationOnce(
      () => Promise.resolve({ json: {} }) as unknown as ReturnType<typeof jsonFetch>
    );

    mockJsonFetch.mockImplementationOnce(() => toss(new DummyError()));

    await expect(getNpmPackageVersion('some-package')).resolves.toBeNull();
    await expect(getNpmPackageVersion('some-package')).rejects.toThrowError(
      DummyError
    );
  });
});

describe('::sendBadgeSvgResponse', () => {
  it('sets header and pipes badge response data', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        server.use(
          rest.all('*', async (_, res, ctx) => {
            return res(ctx.status(200), ctx.json({ some: 'json' }));
          })
        );

        await expect(
          sendBadgeSvgResponse({
            res,
            label: 'label',
            message: 'message',
            color: 'color',
            labelColor: 'labelColor',
            style: 'style'
          }).finally(() => res.end())
        ).resolves.toBeUndefined();
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.headers.get('content-type')).toBe('image/svg+xml;charset=utf-8');
        await expect(res.json()).resolves.toStrictEqual({ some: 'json' });
      }
    });
  });

  it('handles naked badge', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        server.use(
          rest.all('*', async (_, res, ctx) => {
            return res(ctx.status(200), ctx.json({ some: 'json' }));
          })
        );

        await expect(
          sendBadgeSvgResponse({ res }).finally(() => res.end())
        ).resolves.toBeUndefined();
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.headers.get('content-type')).toBe('image/svg+xml;charset=utf-8');
        await expect(res.json()).resolves.toStrictEqual({ some: 'json' });
      }
    });
  });

  it('rejects if badge response is not ok', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        server.use(rest.all('*', async (_, res, ctx) => res(ctx.status(555))));

        await expect(
          sendBadgeSvgResponse({
            res,
            label: 'label',
            message: 'message',
            color: 'color',
            labelColor: 'labelColor',
            style: 'style'
          }).finally(() => res.end())
        ).rejects.toThrow('555');
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.headers.has('content-type')).toBeFalse();
      }
    });
  });
});
