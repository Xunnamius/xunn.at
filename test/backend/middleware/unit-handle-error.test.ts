import { withMiddleware } from 'multiverse/next-api-glue';
import { testApiHandler } from 'next-test-api-route-handler';
import { itemFactory, noopHandler, wrapHandler } from 'testverse/setup';
import { toss } from 'toss-expression';
import handleError, {
  Options,
  ErrorHandler
} from 'universe/backend/middleware/handle-error';

import {
  ValidationError,
  InvalidIdError,
  InvalidEnvironmentError,
  InvalidConfigurationError,
  InvalidParameterError,
  InvalidTokenError,
  AuthError,
  NotAuthenticatedError,
  NotAuthorizedError,
  NotFoundError,
  ItemNotFoundError,
  HttpError,
  TrialError,
  DummyError,
  AppError,
  GuruMeditationError
} from 'universe/error';

it('sends correct HTTP error codes when certain errors occur', async () => {
  expect.hasAssertions();

  const factory = itemFactory<[AppError | string, number]>([
    [new ValidationError(), 400],
    [new ValidationError(''), 400], // ! Edge case for code coverage
    [new InvalidIdError(), 400],
    [new InvalidEnvironmentError(), 400],
    [new InvalidConfigurationError(), 400],
    [new InvalidParameterError(), 400],
    [new InvalidTokenError(), 400],
    [new AuthError(), 403],
    [new NotAuthenticatedError(), 403],
    [new NotAuthorizedError(), 403],
    [new NotFoundError(), 404],
    [new ItemNotFoundError(), 404],
    [new HttpError(), 500],
    [new TrialError(), 500],
    [new DummyError(), 500],
    [new AppError(), 500],
    [new GuruMeditationError(), 500],
    [new Error(), 500], // ? Every other error type should return 500
    ['strange error', 500] // ? This too
  ]);

  await Promise.all(
    factory.items.map(async (item) => {
      const [expectedError, expectedStatus] = item;

      await testApiHandler({
        handler: wrapHandler(
          withMiddleware(async () => toss(expectedError), {
            use: [],
            useOnError: [handleError]
          })
        ),
        test: async ({ fetch }) =>
          fetch().then((res) => expect(res.status).toStrictEqual(expectedStatus))
      });
    })
  );
});

it('throws without calling res.end if response is no longer writable', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: async (rq, rs) => {
      await expect(
        withMiddleware(noopHandler, {
          use: [
            (_req, res) => {
              // eslint-disable-next-line jest/unbound-method
              const send = res.end;
              res.end = ((...args: Parameters<typeof res.end>) => {
                send(...args);
                throw new Error('bad bad not good');
              }) as unknown as typeof res.end;
            }
          ],
          useOnError: [handleError]
        })(rq, rs)
      ).rejects.toMatchObject({ message: 'bad bad not good' });
    },
    test: async ({ fetch }) => {
      expect((await fetch()).status).toBe(200);
    }
  });
});

it('supports pluggable error handlers', async () => {
  expect.hasAssertions();

  const MyError = class extends Error {};

  await testApiHandler({
    rejectOnHandlerError: true,
    handler: withMiddleware<Options>(undefined, {
      use: [
        () => {
          throw new MyError('bad bad not good');
        }
      ],
      useOnError: [handleError],
      options: {
        errorHandlers: new Map([
          [
            MyError,
            (res, errorJson) => {
              res.status(200).send(errorJson);
            }
          ]
        ])
      }
    }),
    test: async ({ fetch }) => {
      expect((await fetch()).status).toBe(200);
      await expect((await fetch()).json()).resolves.toStrictEqual({
        error: 'bad bad not good'
      });
    }
  });
});
