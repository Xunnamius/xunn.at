import { sendBadgeSvgResponse, getNpmPackageVersion } from 'universe/backend';
import { asMockedFunction } from '@xunnamius/jest-types';
import { testApiHandler } from 'next-test-api-route-handler';
import { toss } from 'toss-expression';
import { DummyError } from 'named-app-errors';

import Endpoint, {
  config as Config
} from 'universe/pages/api/npm-pkg-version/[...pkgName]';

jest.mock('universe/backend/github-pkg');
jest.mock('universe/backend');

// ? Unlike short-id which defers middleware invocation, we must mock this early
jest.mock('universe/backend/middleware', () => {
  const { middlewareFactory } = require('multiverse/next-api-glue');
  const { default: handleError } = require('multiverse/next-adhesive/handle-error');

  return {
    withMiddleware: jest
      .fn()
      .mockImplementation(middlewareFactory({ use: [], useOnError: [handleError] }))
  };
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
        color: 'blue'
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
        color: 'blue'
      });
    }
  });
});

it('sends error badge if getCompatVersion fails', async () => {
  expect.hasAssertions();

  mockGetNpmPackageVersion.mockImplementationOnce(() => toss(new DummyError()));

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
        color: 'red'
      });
    }
  });
});
