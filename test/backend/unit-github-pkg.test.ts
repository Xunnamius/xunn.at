import fetch, { FetchError } from 'node-fetch';
import { testApiHandler } from 'next-test-api-route-handler';
import { githubPackageDownloadPipeline } from 'universe/backend/github-pkg';
import { asMockedFunction } from '@xunnamius/jest-types';
import { getEntries } from 'universe/backend/tar';
import { createReadStream, readFileSync } from 'fs';
import { expectedEntries } from 'testverse/setup';
import { Gunzip } from 'minizlib';
import { Readable } from 'stream';

import type { Response } from 'node-fetch';

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
        ).toResolve();

        expect(mockFetch).toBeCalledTimes(3);
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
        ).toResolve();
        res.status(200).end();
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
        ).toResolve();
        res.status(200).end();
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(200);
        await expect(
          getEntries(res.body.pipe(new Gunzip()) as unknown as NodeJS.ReadableStream)
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
        ).toResolve();
        res.status(200).end();
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(200);
        await expect(
          getEntries(res.body.pipe(new Gunzip()) as unknown as NodeJS.ReadableStream)
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
        ).rejects.toThrow('invalid subdirectory: packages/pkg-3');
      },
      test: async ({ fetch }) => void (await fetch())
    });
  });

  it('throws on pipeline error', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: async (_, res) => {
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            body: createReadStream(`/does/not/exist`)
          } as unknown as Response)
        );

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
        ).rejects.toThrow('ENOENT');
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
