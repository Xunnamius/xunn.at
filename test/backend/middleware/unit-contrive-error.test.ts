import { testApiHandler } from 'next-test-api-route-handler';
import { asMockedFunction } from '@xunnamius/jest-types';
import { isDueForContrivedError } from 'universe/backend/request';
import { wrapHandler, noopHandler } from 'testverse/setup';
import { withMiddleware } from 'multiverse/next-api-glue';
import contriveError, { Options } from 'universe/backend/middleware/contrive-error';

jest.mock('universe/backend/request');

const mockIsDueForContrivedError = asMockedFunction(isDueForContrivedError);

beforeEach(() => {
  mockIsDueForContrivedError.mockReturnValue(false);
});

it('does not inject contrived errors by default', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [contriveError]
      })
    ),
    test: async ({ fetch }) => {
      mockIsDueForContrivedError.mockReturnValue(true);
      await expect(fetch().then((r) => r.status)).resolves.toBe(200);
    }
  });
});

it('injects contrived errors when due if enabled', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [contriveError],
        options: { enableContrivedErrors: true }
      })
    ),
    test: async ({ fetch }) => {
      mockIsDueForContrivedError.mockReturnValue(false);
      await expect(fetch().then((r) => r.status)).resolves.toBe(200);
      mockIsDueForContrivedError.mockReturnValue(true);
      await expect(fetch().then((r) => r.status)).resolves.toBe(555);
      mockIsDueForContrivedError.mockReturnValue(false);
      await expect(fetch().then((r) => r.status)).resolves.toBe(200);
    }
  });
});
