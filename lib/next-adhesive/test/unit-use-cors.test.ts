import { testApiHandler } from 'next-test-api-route-handler';
import { isolatedImport, wrapHandler, noopHandler } from 'testverse/setup';
import { withMiddleware } from 'multiverse/next-api-glue';
import useCors from 'multiverse/next-adhesive/use-cors';

afterEach(() => {
  jest.dontMock('cors');
});

it('works', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(withMiddleware(noopHandler, { use: [] })),
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
  });

  await testApiHandler({
    handler: wrapHandler(withMiddleware(noopHandler, { use: [useCors] })),
    test: async ({ fetch }) => {
      const res = await fetch();
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    }
  });
});

it('handles cors package errors gracefully', async () => {
  expect.hasAssertions();

  jest.doMock(
    'cors',
    () => () => (_req: unknown, _res: unknown, cb: (e: Error) => void) => {
      return cb(new Error('fake error'));
    }
  );

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware(noopHandler, {
        use: [
          isolatedImport<typeof useCors>({
            path: 'multiverse/next-adhesive/use-cors'
          })
        ],
        useOnError: [
          (_req, res, ctx) => {
            expect(ctx.runtime.error).toMatchObject({ message: 'fake error' });
            res.status(555).end();
          }
        ]
      })
    ),
    test: async ({ fetch }) => expect((await fetch()).status).toBe(555)
  });
});
