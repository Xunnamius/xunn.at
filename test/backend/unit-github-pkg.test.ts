import { readFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';

import { testApiHandler } from 'next-test-api-route-handler';
import { rest } from 'msw';
import { setupServer } from 'msw/node';

import { githubPackageDownloadPipeline } from 'universe/backend/github-pkg';
import { getEntries } from 'universe/backend/tar';

import { expectedEntries } from 'testverse/setup';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('::githubPackageDownloadPipeline', () => {
  it('throws when walking off potential commits array', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        await expect(
          githubPackageDownloadPipeline({
            res,
            repoData: {
              potentialCommits: [undefined] as unknown as string[],
              repo: 'repo',
              owner: 'user',
              subdir: ''
            }
          })
        ).rejects.toThrow('walked off potential commits array');
        // ? Ensure response is sent since this error happens very early
        res.end();
      },
      test: async ({ fetch }) => void (await fetch())
    });
  });

  it('throws if all potential commit codeload urls fail', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        server.use(
          rest.all('*', (_, res, ctx) => {
            return res(ctx.status(500));
          })
        );

        await expect(
          githubPackageDownloadPipeline({
            res,
            repoData: {
              potentialCommits: ['dummy-1', 'dummy-2'],
              repo: 'repo',
              owner: 'user',
              subdir: ''
            }
          })
        ).rejects.toThrow(
          /^could not find package at url\(s\): https:\/\/\S+?\/\[dummy-1, dummy-2\]$/
        );
        // ? Ensure response is sent since this error happens very early
        res.end();
      },
      test: async ({ fetch }) => void (await fetch())
    });
  });

  it('tries all potential commits, stopping on first success', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        let count = 0;

        server.use(
          rest.all('*', (_, res, ctx) => {
            return count++ >= 2
              ? res(ctx.status(200), ctx.body('some data here'))
              : res(ctx.status(404));
          })
        );

        await expect(
          githubPackageDownloadPipeline({
            res,
            repoData: {
              potentialCommits: ['1', '2', '3', '4', '5'],
              repo: 'repo',
              owner: 'user',
              subdir: ''
            }
          })
        ).resolves.toBeUndefined();

        expect(count).toBe(3);
      },
      test: async ({ fetch }) => void (await fetch())
    });
  });

  it('passes through tar from codeload if no subdir', async () => {
    expect.hasAssertions();

    const target = `${__dirname}/../fixtures/polyrepo.tar.gz`;

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        server.use(
          rest.all('*', async (_, res, ctx) => {
            return res(ctx.status(200), ctx.body(readFileSync(target)));
          })
        );

        await expect(
          githubPackageDownloadPipeline({
            res,
            repoData: {
              potentialCommits: ['1'],
              repo: 'repo',
              owner: 'user',
              subdir: ''
            }
          })
        ).resolves.toBeUndefined();
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(200);
        expect((await res.buffer()).equals(readFileSync(target))).toBeTrue();
      }
    });
  });

  it('returns repacked tar with respect to subdir', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        let count = 0;

        server.use(
          rest.all('*', async (_, res, ctx) => {
            return res(
              ctx.status(200),
              ...(count++ == 0
                ? [ctx.body(readFileSync(`${__dirname}/../fixtures/monorepo.tar.gz`))]
                : [])
            );
          })
        );

        await expect(
          githubPackageDownloadPipeline({
            res,
            repoData: {
              potentialCommits: ['1'],
              repo: 'repo',
              owner: 'user',
              subdir: 'packages/pkg-1'
            }
          })
        ).resolves.toBeUndefined();
        // ? Don't need to call end since data is flowing through pipeline
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(200);
        await expect(
          getEntries(res.body.pipe(createGunzip()))
        ).resolves.toStrictEqual(expectedEntries.pkg1);
      }
    });

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        let count = 0;

        server.use(
          rest.all('*', async (_, res, ctx) => {
            return res(
              ctx.status(200),
              ...(count++ == 0
                ? [ctx.body(readFileSync(`${__dirname}/../fixtures/monorepo.tar.gz`))]
                : [])
            );
          })
        );

        await expect(
          githubPackageDownloadPipeline({
            res,
            repoData: {
              potentialCommits: ['1'],
              repo: 'repo',
              owner: 'user',
              subdir: 'packages/pkg-2'
            }
          })
        ).resolves.toBeUndefined();
        // ? Don't need to call end since data is flowing through pipeline
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(200);
        await expect(
          getEntries(res.body.pipe(createGunzip()))
        ).resolves.toStrictEqual(expectedEntries.pkg2);
      }
    });
  });

  it('throws on non-existent subdir', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        let count = 0;

        server.use(
          rest.all('*', async (_, res, ctx) => {
            return count++ == 0
              ? res(
                  ctx.status(200),
                  ctx.body(readFileSync(`${__dirname}/../fixtures/monorepo.tar.gz`))
                )
              : res(ctx.status(404));
          })
        );

        // ? Call end early since throwing will destroy the pipeline otherwise
        // ? (i.e. ECONNRESET). In real life, use pre-emptive error checking
        // ? before invoking the pipeline so that it doesn't explode.
        res.end();

        await expect(
          githubPackageDownloadPipeline({
            res,
            repoData: {
              potentialCommits: ['1'],
              repo: 'repo',
              owner: 'user',
              subdir: 'packages/pkg-3'
            }
          })
        ).rejects.toThrow(
          'repository user/repo@1 does not contain sub directory "packages/pkg-3"'
        );
      },
      test: async ({ fetch }) => void (await fetch())
    });
  });

  it('throws HttpError on FetchError', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        server.use(
          rest.all('*', async (_, res) => {
            return res.networkError('simulated network error');
          })
        );

        // ? Call end early since throwing will destroy the pipeline otherwise
        // ? (i.e. ECONNRESET). In real life, use pre-emptive error checking
        // ? before invoking the pipeline so that it doesn't explode.
        res.end();

        await expect(
          githubPackageDownloadPipeline({
            res,
            repoData: {
              potentialCommits: ['1'],
              repo: 'repo',
              owner: 'user',
              subdir: 'packages/pkg-3'
            }
          })
        ).rejects.toThrow(/^HTTP failure: .* simulated network error$/);
      },
      test: async ({ fetch }) => void (await fetch())
    });
  });
});
