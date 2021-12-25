import Endpoint, { config as Config } from 'universe/pages/api/[shortId]';
import { githubPackageDownloadPipeline } from 'universe/backend/github-pkg';
import { isRateLimited, resolveShortId } from 'universe/backend/request';
import { asMockedFunction } from '@xunnamius/jest-types';
import { testApiHandler } from 'next-test-api-route-handler';
import { toss } from 'toss-expression';
import { TrialError } from 'named-app-errors';
import { withMockedOutput } from 'testverse/setup';

jest.mock('universe/backend/github-pkg');
jest.mock('universe/backend/request');

const handler = Endpoint as typeof Endpoint & { config?: typeof Config };
handler.config = Config;

const mockPkgPipeline = asMockedFunction(githubPackageDownloadPipeline);
const mockResolveShortId = asMockedFunction(resolveShortId);
const mockedIsRateLimited = asMockedFunction(isRateLimited);

beforeEach(() => {
  mockedIsRateLimited.mockImplementation(() =>
    Promise.resolve({
      limited: false,
      retryAfter: 0
    })
  );

  mockPkgPipeline.mockImplementation(({ res }) => {
    res.end();
    return Promise.resolve();
  });
});

it('short links redirect to full links', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce(() =>
    Promise.resolve({ type: 'link', fullLink: 'https://google.com' })
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

it('package link calls pipeline with expected parameters', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementationOnce(() =>
    Promise.resolve({
      type: 'github-pkg',
      defaultCommit: 'main',
      pseudoFilename: (commit: string) => `something-${commit}`,
      user: 'user',
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
        repo: {
          user: 'user',
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
      user: 'usr',
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
        repo: {
          user: 'usr',
          repo: 'rpo',
          subdir: 'subdir/pkg',
          potentialCommits: ['10.5.7', 'prefix-10.5.7']
        }
      });
    }
  });
});

it('only package link responses have special headers', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementation(() =>
    Promise.resolve({
      type: 'github-pkg',
      defaultCommit: 'main',
      pseudoFilename: (commit: string) => `something-${commit}`,
      user: 'usr',
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
      expect(res.headers.get('Content-Type')).toBe('application/gzip');
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
      expect(res.headers.get('Content-Type')).toBe('application/gzip');
      expect(res.headers.get('Content-Disposition')).toBe(
        'attachment; filename="something-main"'
      );
    }
  });
});

it('removes special headers on error', async () => {
  expect.hasAssertions();

  mockResolveShortId.mockImplementation(() =>
    Promise.resolve({
      type: 'github-pkg',
      defaultCommit: 'main',
      pseudoFilename: () => 'something',
      user: 'usr',
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
          expect(res.headers.get('Content-Type')).not.toBe('application/gzip');
          expect(res.headers.has('Content-Disposition')).toBeFalse();
        }
      });

      await testApiHandler({
        handler,
        params: { shortId: 'some-id@10.5.7' },
        test: async ({ fetch }) => {
          const res = await fetch();
          expect(res.status).toBe(500);
          expect(res.headers.get('Content-Type')).not.toBe('application/gzip');
          expect(res.headers.has('Content-Disposition')).toBeFalse();
        }
      });
    },
    { passthrough: { stdErrSpy: true } }
  );
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
            error: 'bad short link entry in database'
          });
        }
      });
    },
    { passthrough: { stdErrSpy: true } }
  );
});
