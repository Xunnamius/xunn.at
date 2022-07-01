import Endpoint, { config as Config } from 'universe/pages/api/[shortId]';
import { githubPackageDownloadPipeline } from 'universe/backend/github-pkg';
import { resolveShortId, sendBadgeSvgResponse } from 'universe/backend';
import { withMiddleware } from 'universe/backend/middleware';
import { asMockedFunction } from '@xunnamius/jest-types';
import { testApiHandler } from 'next-test-api-route-handler';
import { toss } from 'toss-expression';
import { DummyError, ItemNotFoundError } from 'universe/error';
import { withMockedOutput } from 'testverse/setup';
import { middlewareFactory } from 'multiverse/next-api-glue';
import handleError from 'multiverse/next-adhesive/handle-error';

jest.mock('universe/backend/github-pkg');
jest.mock('universe/backend/middleware');
jest.mock('universe/backend');

const handler = Endpoint as typeof Endpoint & { config?: typeof Config };
handler.config = Config;

const mockWithMiddleware = asMockedFunction(withMiddleware);
const mockPkgPipeline = asMockedFunction(githubPackageDownloadPipeline);
const mockResolveShortId = asMockedFunction(resolveShortId);
const mockSendBadgeSvgResponse = asMockedFunction(sendBadgeSvgResponse);

beforeEach(() => {
  mockWithMiddleware.mockImplementation(
    middlewareFactory({ use: [], useOnError: [handleError] })
  );

  mockPkgPipeline.mockImplementation(({ res }) => {
    res.end();
    return Promise.resolve();
  });

  mockSendBadgeSvgResponse.mockImplementation(({ res }) => {
    res.end();
    return Promise.resolve();
  });
});

it('uri links redirect to real links', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce(() =>
    Promise.resolve({ type: 'uri', realLink: 'https://google.com' })
  );

  await testApiHandler({
    handler,
    params: { shortId: 'some-id' },
    test: async ({ fetch }) => {
      const res = await fetch({ redirect: 'manual' });
      expect(res.status).toBe(308);
      expect(res.headers.get('location')).toBe('https://google.com/');
      expect(mockResolveShortId).toBeCalledWith({ shortId: 'some-id' });
      expect(mockPkgPipeline).not.toBeCalled();
    }
  });
});

it('package links call pipeline with expected parameters', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce(() =>
    Promise.resolve({
      type: 'github-pkg',
      defaultCommit: 'main',
      pseudoFilename: (commit: string) => `something-${commit}`,
      owner: 'user',
      repo: 'repo',
      subdir: 'subdir',
      tagPrefix: 'prefix'
    })
  );

  await testApiHandler({
    handler,
    params: { shortId: 'some-id' },
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(res.redirected).toBeFalse();
      expect(mockResolveShortId).toBeCalledWith({ shortId: 'some-id' });
      expect(mockPkgPipeline).toBeCalledWith({
        res: expect.anything(),
        repoData: {
          owner: 'user',
          repo: 'repo',
          subdir: 'subdir',
          potentialCommits: ['main']
        }
      });
    }
  });
});

it('package links support @commitish', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce(() =>
    Promise.resolve({
      type: 'github-pkg',
      defaultCommit: 'master',
      pseudoFilename: (commit: string) => `something-${commit}`,
      owner: 'usr',
      repo: 'rpo',
      subdir: 'subdir/pkg',
      tagPrefix: 'prefix-'
    })
  );

  await testApiHandler({
    handler,
    params: { shortId: 'some-id@10.5.7' },
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(mockResolveShortId).toBeCalledWith({ shortId: 'some-id' });
      expect(mockPkgPipeline).toBeCalledWith({
        res: expect.anything(),
        repoData: {
          owner: 'usr',
          repo: 'rpo',
          subdir: 'subdir/pkg',
          potentialCommits: ['10.5.7', 'prefix-10.5.7']
        }
      });
    }
  });
});

it('badge links call pipeline with expected parameters', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce(() =>
    Promise.resolve({
      type: 'badge',
      color: 'color',
      message: 'message',
      label: 'label',
      labelColor: 'labelColor'
    })
  );

  await testApiHandler({
    handler,
    params: { shortId: 'some-id' },
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(mockSendBadgeSvgResponse).toBeCalledWith({
        res: expect.anything(),
        color: 'color',
        message: 'message',
        label: 'label',
        labelColor: 'labelColor'
      });
    }
  });

  mockSendBadgeSvgResponse;
});

it('file links return a not-implemented error', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce(() =>
    Promise.resolve({
      type: 'file',
      name: 'name',
      resourceLink: 'here'
    })
  );

  await withMockedOutput(async () => {
    await testApiHandler({
      handler,
      params: { shortId: 'some-id' },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(501);
      }
    });
  });
});

it('only package link responses have github-pkg-specific headers', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementation(() =>
    Promise.resolve({
      type: 'github-pkg',
      defaultCommit: 'main',
      pseudoFilename: (commit: string) => `something-${commit}`,
      owner: 'usr',
      repo: 'rpo',
      subdir: 'subdir/pkg',
      tagPrefix: 'prefix-'
    })
  );

  await testApiHandler({
    handler,
    params: { shortId: 'some-id@10.5.7' },
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/gzip');
      expect(res.headers.get('content-disposition')).toBe(
        'attachment; filename="something-10.5.7"'
      );
    }
  });

  await testApiHandler({
    handler,
    params: { shortId: 'some-id' },
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/gzip');
      expect(res.headers.get('content-disposition')).toBe(
        'attachment; filename="something-main"'
      );
    }
  });
});

it('custom headers (and cache-control) are applied when available', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce(() =>
    Promise.resolve({
      type: 'uri',
      realLink: 'http://fake.url',
      headers: { h1: 'v1', h2: ['v2', 'v3'] }
    })
  );

  await testApiHandler({
    handler,
    params: { shortId: 'some-id' },
    test: async ({ fetch }) => {
      const res = await fetch({ redirect: 'manual' });
      expect(res.status).toBe(308);
      expect(res.headers.has('cache-control')).toBeTrue();
      expect(res.headers.has('h1')).toBeTrue();
      expect(res.headers.get('h2')).toBe('v2, v3');
    }
  });
});

it('removes github-pkg-specific headers on error', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementation(() =>
    Promise.resolve({
      type: 'github-pkg',
      defaultCommit: 'main',
      pseudoFilename: () => 'something',
      owner: 'usr',
      repo: 'rpo',
      subdir: 'subdir/pkg',
      tagPrefix: 'prefix-'
    })
  );

  mockPkgPipeline.mockImplementation(() => toss(new DummyError()));

  await withMockedOutput(async () => {
    await testApiHandler({
      handler,
      params: { shortId: 'some-id' },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(500);
        expect(res.headers.get('content-type')).not.toBe('application/gzip');
        expect(res.headers.has('content-disposition')).toBeFalse();
      }
    });

    await testApiHandler({
      handler,
      params: { shortId: 'some-id@10.5.7' },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(500);
        expect(res.headers.get('content-type')).not.toBe('application/gzip');
        expect(res.headers.has('content-disposition')).toBeFalse();
      }
    });
  });
});

it('removes custom headers on error', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce(
    () =>
      Promise.resolve({
        type: 'does-not-exist',
        headers: { h1: 'v1', h2: ['v2', 'v3'] }
      }) as unknown as ReturnType<typeof resolveShortId>
  );

  await withMockedOutput(async () => {
    await testApiHandler({
      handler,
      params: { shortId: 'some-id' },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(500);
        expect(res.headers.has('h1')).toBeFalse();
        expect(res.headers.has('h2')).toBeFalse();
      }
    });
  });
});

it('does not remove cache-control on NotFound error', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce((id) =>
    Promise.reject(new ItemNotFoundError(id, 'short-id'))
  );

  await testApiHandler({
    handler,
    params: { shortId: 'some-id' },
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(404);
      expect(res.headers.has('cache-control')).toBeTrue();
    }
  });

  mockResolveShortId.mockImplementationOnce(() => Promise.reject(new DummyError()));

  await withMockedOutput(async () => {
    await testApiHandler({
      handler,
      params: { shortId: 'some-id' },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(500);
        expect(res.headers.has('cache-control')).toBeFalse();
      }
    });
  });
});

it('throws on illegal short link type', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce(
    () =>
      Promise.resolve({ type: 'bad type' }) as unknown as ReturnType<
        typeof resolveShortId
      >
  );

  await withMockedOutput(async () => {
    await testApiHandler({
      handler,
      params: { shortId: 'some-id' },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(500);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: '"bad type" short links are not currently supported'
        });
      }
    });
  });
});
