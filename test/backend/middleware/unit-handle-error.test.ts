import { withMiddleware } from 'multiverse/next-api-glue';
import { testApiHandler } from 'next-test-api-route-handler';
import { itemFactory, wrapHandler } from 'testverse/setup';
import { toss } from 'toss-expression';
import handleError from 'universe/backend/middleware/handle-error';

import {
  InvalidIdError,
  InvalidKeyError,
  ValidationError,
  NotAuthorizedError,
  NotFoundError,
  ItemNotFoundError,
  AppError,
  GuruMeditationError
} from 'universe/error';

it('sends correct HTTP error codes when certain errors occur', async () => {
  expect.hasAssertions();

  const factory = itemFactory<[AppError | string, number]>([
    [new InvalidIdError(), 400],
    [new InvalidKeyError(), 400],
    [new ValidationError(), 400],
    [new ValidationError(''), 400], // ! Edge case for code coverage
    [new NotAuthorizedError(), 403],
    [new NotFoundError(), 404],
    [new ItemNotFoundError(), 404],
    [new AppError(), 500],
    [new GuruMeditationError(), 500],
    [new Error(), 500], // ? Every other error type should return 500
    ['strange error', 500] // ? This too
  ]);

  let expectedStatus: number;
  let expectedError: AppError | string;

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware(async () => toss(expectedError), {
        use: [],
        useOnError: [handleError]
      })
    ),
    test: async ({ fetch }) => {
      await Promise.all(
        factory.items.map(async (item) => {
          [expectedError, expectedStatus] = item;
          return fetch().then((res) => expect(res.status).toStrictEqual(expectedStatus));
        })
      );
    }
  });
});
