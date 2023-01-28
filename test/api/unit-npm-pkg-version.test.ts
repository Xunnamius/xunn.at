import { sendBadgeSvgResponse, getNpmPackageVersion } from 'universe/backend';
import { asMockedFunction } from '@xunnamius/jest-types';
import { testApiHandler } from 'next-test-api-route-handler';
import { toss } from 'toss-expression';
import { DummyError } from 'universe/error';
import { withMockedOutput } from 'testverse/setup';

import Endpoint, {
  config as Config
} from 'universe/pages/api/npm-pkg-version/[...pkgName]';

jest.mock('universe/backend/github-pkg');
jest.mock('universe/backend');

type UniverseBackendMiddleware = typeof import('universe/backend/middleware');

// ? Unlike short-id which defers middleware invocation, we must mock this early
jest.mock('universe/backend/middleware', (): UniverseBackendMiddleware => {
  const { middlewareFactory } = require('multiverse/next-api-glue');
  const { default: handleError } = require('multiverse/next-adhesive/handle-error');

  return {
    withMiddleware: jest
      .fn()
      .mockImplementation(middlewareFactory({ use: [], useOnError: [handleError] }))
  } as unknown as UniverseBackendMiddleware;
});

const handler = Endpoint as typeof Endpoint & { config?: typeof Config };
handler.config = Config;

const mockSendBadgeSvgResponse = asMockedFunction(sendBadgeSvgResponse);
const mockGetNpmPackageVersion = asMockedFunction(getNpmPackageVersion);

beforeEach(() => {
  mockGetNpmPackageVersion.mockImplementation(() => Promise.resolve('a.b.c'));
  mockSendBadgeSvgResponse.mockImplementation(({ res }) => {
    res.end();
    return Promise.resolve();
  });
});

it('sends badge with compat version', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler,
    params: { pkgName: ['super-cool-pkg'] },
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(mockSendBadgeSvgResponse).toBeCalledWith({
        res: expect.anything(),
        label: 'npm install',
        message: 'super-cool-pkg@a.b.c',
        color: 'blue',
        style: 'flat-square'
      });
    }
  });

  await testApiHandler({
    handler,
    params: { pkgName: ['@super', 'cool-pkg'] },
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(mockSendBadgeSvgResponse).toBeCalledWith({
        res: expect.anything(),
        label: 'npm install',
        message: '@super/cool-pkg@a.b.c',
        color: 'blue',
        style: 'flat-square'
      });
    }
  });
});

it('sends error badge if getCompatVersion fails', async () => {
  expect.hasAssertions();

  mockGetNpmPackageVersion.mockImplementationOnce(() => toss(new DummyError()));
  mockGetNpmPackageVersion.mockImplementationOnce(() => Promise.resolve(null));

  await withMockedOutput(async () => {
    await testApiHandler({
      handler,
      params: { pkgName: ['super-cool-pkg'] },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(200);
        expect(mockSendBadgeSvgResponse).toBeCalledWith({
          res: expect.anything(),
          label: 'npm install',
          message: 'error',
          color: 'red',
          style: 'flat-square'
        });
      }
    });
  });

  await testApiHandler({
    handler,
    params: { pkgName: ['super-cool-pkg'] },
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(mockSendBadgeSvgResponse).toBeCalledWith({
        res: expect.anything(),
        label: 'npm install',
        message: 'error',
        color: 'red',
        style: 'flat-square'
      });
    }
  });
});
