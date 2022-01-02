import { sendBadgeSvgResponse, getNpmPackageVersion } from 'universe/backend';
import { asMockedFunction } from '@xunnamius/jest-types';
import { testApiHandler } from 'next-test-api-route-handler';

import Endpoint, {
  config as Config
} from 'universe/pages/api/npm-pkg-version/[...pkgName]';

jest.mock('universe/backend/github-pkg');
jest.mock('universe/backend');

// ? Unlike short-id (defers middleware invocation), we must mock this early
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

beforeEach(() => {
  mockSendBadgeSvgResponse.mockImplementation(({ res }) => {
    res.end();
    return Promise.resolve();
  });
});

it('(todo)', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler,
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
    }
  });
});
