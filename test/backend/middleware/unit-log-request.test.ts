import { testApiHandler } from 'next-test-api-route-handler';
import { asMockedFunction } from '@xunnamius/jest-types';
import { addToRequestLog } from 'universe/backend/request';
import { withMiddleware } from 'multiverse/next-api-glue';
import { wrapHandler, noopHandler } from 'testverse/setup';
import { toss } from 'toss-expression';
import logRequest from 'universe/backend/middleware/log-request';

jest.mock('universe/backend/request');

const mockAddToRequestLog = asMockedFunction(addToRequestLog);

beforeEach(() => {
  mockAddToRequestLog.mockReturnValue(Promise.resolve());
});

it('logs requests on send', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      wrapHandler(
        withMiddleware(async (_req, res) => res.status(404).send({}), {
          use: [logRequest]
        })
      )
    ),
    test: async ({ fetch }) => {
      await Promise.all([fetch(), fetch(), fetch()]);
      expect(mockAddToRequestLog).toBeCalledTimes(3);
    }
  });
});

it('logs requests on end', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      wrapHandler(
        withMiddleware(async (_req, res) => res.status(404).end(), {
          use: [logRequest]
        })
      )
    ),
    test: async ({ fetch }) => {
      await Promise.all([fetch(), fetch(), fetch()]);
      expect(mockAddToRequestLog).toBeCalledTimes(3);
    }
  });
});

it('handles request log errors after res.end as gracefully as possible', async () => {
  expect.hasAssertions();

  mockAddToRequestLog.mockImplementation(() => toss(new Error('fake error')));
  let called = false;

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware(noopHandler, {
        use: [logRequest],
        useOnError: [
          (_req, _res, ctx) => {
            expect(ctx.runtime.error).toMatchObject({ message: 'fake error' });
            called = true;
          }
        ]
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch()).status).toBe(200);
      expect(called).toBeTrue();
    }
  });
});
