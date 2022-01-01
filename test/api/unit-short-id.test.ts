import Endpoint, { config as Config } from 'universe/pages/api/[shortId]';
import { githubPackageDownloadPipeline } from 'universe/backend/github-pkg';
import { clientIsRateLimited } from 'multiverse/next-limit';
import { resolveShortId } from 'universe/backend';
import { asMockedFunction } from '@xunnamius/jest-types';
import { testApiHandler } from 'next-test-api-route-handler';
import { toss } from 'toss-expression';
import { TrialError } from 'named-app-errors';
import { withMockedOutput } from 'testverse/setup';

jest.mock('universe/backend/github-pkg');
jest.mock('multiverse/next-limit');
jest.mock('universe/backend');

const handler = Endpoint as typeof Endpoint & { config?: typeof Config };
handler.config = Config;

const mockPkgPipeline = asMockedFunction(githubPackageDownloadPipeline);
const mockedIsRateLimited = asMockedFunction(clientIsRateLimited);
const mockResolveShortId = asMockedFunction(resolveShortId);

beforeEach(() => {
  mockedIsRateLimited.mockImplementation(() =>
    Promise.resolve({
      isLimited: false,
      retryAfter: 0
    })
  );

  mockPkgPipeline.mockImplementation(({ res }) => {
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
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(res.redirected).toBeTrue();
      expect(res.url).toBe('https://www.google.com/');
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
      expect(res.redirected).toBeFalse();
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
});

it('file links call pipeline with expected parameters', async () => {
  expect.hasAssertions();
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
      expect(res.headers.get('Content-Disposition')).toBe(
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
      expect(res.headers.get('Content-Disposition')).toBe(
        'attachment; filename="something-main"'
      );
    }
  });
});

it('custom headers are applied to uri, badge, and file links', async () => {
  expect.hasAssertions();
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

  mockPkgPipeline.mockImplementation(() => toss(new TrialError()));

  await withMockedOutput(
    async () => {
      await testApiHandler({
        handler,
        params: { shortId: 'some-id' },
        test: async ({ fetch }) => {
          const res = await fetch();
          expect(res.status).toBe(500);
          expect(res.headers.get('content-type')).not.toBe('application/gzip');
          expect(res.headers.has('Content-Disposition')).toBeFalse();
        }
      });

      await testApiHandler({
        handler,
        params: { shortId: 'some-id@10.5.7' },
        test: async ({ fetch }) => {
          const res = await fetch();
          expect(res.status).toBe(500);
          expect(res.headers.get('content-type')).not.toBe('application/gzip');
          expect(res.headers.has('Content-Disposition')).toBeFalse();
        }
      });
    },
    { passthrough: { stdErrSpy: true } }
  );
});

it('removes custom headers on error', async () => {
  expect.hasAssertions();
});

it('throws on illegal short link type', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce(
    () =>
      Promise.resolve({ type: 'bad type' }) as unknown as ReturnType<
        typeof resolveShortId
      >
  );

  await withMockedOutput(
    async () => {
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
    },
    { passthrough: { stdErrSpy: true } }
  );
});

it('throws on illegal short link type', async () => {
  expect.hasAssertions();
});
