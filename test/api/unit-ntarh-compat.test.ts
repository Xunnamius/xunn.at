import Endpoint, { config as Config } from 'universe/pages/api/ntarh-compat';
import { getCompatVersion, sendBadgeSvgResponse } from 'universe/backend';
import { asMockedFunction } from '@xunnamius/jest-types';
import { testApiHandler } from 'next-test-api-route-handler';
import { toss } from 'toss-expression';
import { DummyError } from 'universe/error';
import { withMockedOutput } from 'testverse/setup';

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
const mockGetCompatVersion = asMockedFunction(getCompatVersion);

beforeEach(() => {
  mockGetCompatVersion.mockImplementation(() => Promise.resolve('x.y.z'));
  mockSendBadgeSvgResponse.mockImplementation(({ res }) => {
    res.end();
    return Promise.resolve();
  });
});

it('sends badge with compat version', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler,
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(mockSendBadgeSvgResponse).toBeCalledWith({
        res: expect.anything(),
        label: 'compatible with',
        message: 'next@%E2%89%A4x.y.z',
        color: 'blue',
        style: 'flat-square'
      });
    }
  });
});

it('sends error badge if getCompatVersion fails', async () => {
  expect.hasAssertions();

  mockGetCompatVersion.mockImplementationOnce(() => toss(new DummyError()));

  await withMockedOutput(async () => {
    await testApiHandler({
      handler,
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(200);
        expect(mockSendBadgeSvgResponse).toBeCalledWith({
          res: expect.anything(),
          label: 'compatible with',
          message: 'error',
          color: 'red',
          style: 'flat-square'
        });
      }
    });
  });
});
