import fetch, { FetchError } from 'node-fetch';
import { testApiHandler } from 'next-test-api-route-handler';
import { githubPackageDownloadPipeline } from 'universe/backend/github-pkg';
import { asMockedFunction } from '@xunnamius/jest-types';
import { getEntries } from 'universe/backend/tar';
import { createReadStream, readFileSync } from 'fs';
import { expectedEntries } from 'testverse/setup';
import { createGunzip } from 'zlib';
import { Readable } from 'stream';

import type { Response } from 'node-fetch';
import { DummyError } from 'named-app-errors';

jest.mock('node-fetch', () => {
  const fetch = jest.fn();
  // ? We also need to mock FetchError (earlier than when beforeEach runs)
  // @ts-expect-error: overriding FetchError with a custom class
  fetch.FetchError = class FakeFetchError extends Error {
    constructor(message: string) {
      super(message);
    }
  };
  return fetch;
});

const mockFetch = asMockedFunction(fetch);
const fetchActual = jest.requireActual('node-fetch');

beforeEach(() => {
  // ? We need to leave node-fetch alone since NTARH uses it too
  // ! MOCK FETCH CALLS IN EACH TEST HANDLER SO IT'S NOT MAKING REAL REQUESTS !
  // TODO: replace this with MSW
  mockFetch.mockImplementation(fetchActual);
});

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
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({ status: 500 } as Response)
        );
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({ status: 500 } as Response)
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
        mockFetch.mockClear();
        mockFetch.mockImplementationOnce(() => Promise.resolve({} as Response));
        mockFetch.mockImplementationOnce(() => Promise.resolve({} as Response));
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            body: createReadStream('/dev/null')
          } as unknown as Response)
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

        expect(mockFetch).toBeCalledTimes(3);
        // ? Ensure response is sent since the null stream breaks the pipeline
        res.end();
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
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            body: createReadStream(target)
          } as unknown as Response)
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
        // ? Don't need to call end since data is flowing through pipeline
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
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            body: createReadStream(`${__dirname}/../fixtures/monorepo.tar.gz`)
          } as unknown as Response)
        );

        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({ ok: true } as unknown as Response)
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
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            body: createReadStream(`${__dirname}/../fixtures/monorepo.tar.gz`)
          } as unknown as Response)
        );

        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({ ok: true } as unknown as Response)
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
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            body: createReadStream(`${__dirname}/../fixtures/monorepo.tar.gz`)
          } as unknown as Response)
        );

        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({ ok: false } as unknown as Response)
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

  it('throws on generic pipeline error', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            body: new Readable({
              read() {
                this.destroy(new DummyError('bad bad is bad not good good'));
              }
            })
          } as unknown as Response)
        );

        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({ ok: true } as unknown as Response)
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
        ).rejects.toThrow('bad bad is bad not good good');
      },
      test: async ({ fetch }) => void (await fetch())
    });
  });

  it('throws HttpError on FetchError in pipeline', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            body: new Readable({
              read() {
                this.destroy(new FetchError('bad bad is not good good', 'fake'));
              }
            })
          } as unknown as Response)
        );

        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({ ok: true } as unknown as Response)
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
        ).rejects.toThrow('HTTP failure: bad bad is not good good');
      },
      test: async ({ fetch }) => void (await fetch())
    });
  });
});
