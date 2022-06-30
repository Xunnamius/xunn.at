/* eslint-disable jest/no-conditional-expect */
import { testApiHandler } from 'next-test-api-route-handler';
import { withMockedOutput, noopHandler, wrapHandler } from 'testverse/setup';
import { withMiddleware } from 'multiverse/next-api-glue';

import addRawBody, {
  ensureNextApiRequestHasRawBody,
  isNextApiRequestWithRawBody
} from 'multiverse/next-adhesive/add-raw-body';

import type { NextApiRequest } from 'next';
import type { WithRawBody, Options } from 'multiverse/next-adhesive/add-raw-body';

describe('::<default export>', () => {
  it('throws if bodyParser is not disabled', async () => {
    expect.hasAssertions();

    const handler = wrapHandler(
      withMiddleware<Options>(noopHandler, { use: [addRawBody] }),
      {}
    );

    await withMockedOutput(async () => {
      await expect(
        testApiHandler({
          rejectOnHandlerError: true,
          handler,
          test: async ({ fetch }) => void (await fetch())
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('body parser must be disabled')
      });
    });

    handler.config = { api: { bodyParser: false } };

    await testApiHandler({
      handler,
      test: async ({ fetch }) => expect((await fetch()).status).toBe(200)
    });
  });

  it('throws if rawBody property already defined on request object', async () => {
    expect.hasAssertions();

    const normalHandler = wrapHandler(
      withMiddleware<Options>(noopHandler, { use: [addRawBody] })
    );

    normalHandler.config = { api: { bodyParser: false } };

    await testApiHandler({
      handler: normalHandler,
      test: async ({ fetch }) => expect((await fetch()).status).toBe(200)
    });

    const obsoleterHandler = wrapHandler(async (req, res) => {
      (req as WithRawBody<NextApiRequest>).rawBody = 'fake raw body';
      return withMiddleware<Options>(noopHandler, { use: [addRawBody] })(req, res);
    });

    obsoleterHandler.config = { api: { bodyParser: false } };

    await withMockedOutput(async () => {
      await expect(
        testApiHandler({
          rejectOnHandlerError: true,
          handler: obsoleterHandler,
          test: async ({ fetch }) => void (await fetch())
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('already has a defined "rawBody" property')
      });
    });
  });

  it('throws on bad JSON body', async () => {
    expect.hasAssertions();

    const handler = wrapHandler(
      withMiddleware<Options>(noopHandler, { use: [addRawBody] })
    );

    handler.config = { api: { bodyParser: false } };

    await withMockedOutput(async () => {
      await expect(
        testApiHandler({
          rejectOnHandlerError: true,
          handler,
          test: async ({ fetch }) =>
            void (await fetch({
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '<nope>'
            }))
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('invalid JSON body')
      });
    });
  });

  it('throws on invalid body (raw-body chokes)', async () => {
    expect.hasAssertions();

    const handler = wrapHandler(
      withMiddleware<Options>(noopHandler, { use: [addRawBody] })
    );

    handler.config = { api: { bodyParser: false } };

    await withMockedOutput(async () => {
      await expect(
        testApiHandler({
          rejectOnHandlerError: true,
          handler,
          requestPatcher(req) {
            req.destroy();
          },
          test: async ({ fetch }) => void (await fetch())
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('invalid body')
      });
    });
  });

  it('adds rawBody to request object while still providing parsed body', async () => {
    expect.hasAssertions();

    const handler = wrapHandler(
      withMiddleware<Options>(
        (req, res) => {
          if (ensureNextApiRequestHasRawBody(req)) {
            res.status(200).send({ body: req.body, rawBody: req.rawBody });
          }
        },
        { use: [addRawBody] }
      )
    );

    handler.config = { api: { bodyParser: false } };

    await testApiHandler({
      handler,
      test: async ({ fetch }) => {
        let res, json, rawBody, jsonBody;

        // ? Works with empty body (which otherwise evaluates falsy)
        res = await fetch();
        json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toStrictEqual({ body: '', rawBody: '' });

        // ? Works with empty body as JSON
        res = await fetch({ headers: { 'content-type': 'application/json' } });
        json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toStrictEqual({ body: {}, rawBody: '' });

        jsonBody = { a: 1, b: 'c', d: true };
        rawBody = JSON.stringify(jsonBody);
        res = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: rawBody
        });
        json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toStrictEqual({ body: jsonBody, rawBody });

        jsonBody = { a: 2, b: 'z', d: false };
        rawBody = JSON.stringify(jsonBody);
        res = await fetch({
          method: 'PUT',
          headers: { 'content-type': 'application/ld+json' },
          body: rawBody
        });
        json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toStrictEqual({ body: jsonBody, rawBody });

        jsonBody = { a: '3', b: 'd', e: 'true' };
        rawBody = 'a=3&b=d&e=true';
        res = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: rawBody
        });
        json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toStrictEqual({ body: jsonBody, rawBody });

        rawBody = 'hello, world!';
        res = await fetch({
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: rawBody
        });
        json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toStrictEqual({ body: rawBody, rawBody });

        // ? Works with really bad content types
        rawBody = 'hello, world!';
        res = await fetch({
          method: 'POST',
          headers: { 'content-type': '/' },
          body: rawBody
        });
        json = await res.json();

        expect(res.status).toBe(200);
        expect(json).toStrictEqual({ body: rawBody, rawBody });
      }
    });
  });

  it('respects requestBodySizeLimit option', async () => {
    expect.hasAssertions();

    const handler = wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [addRawBody],
        options: { requestBodySizeLimit: 1 }
      })
    );

    handler.config = { api: { bodyParser: false } };

    await testApiHandler({
      handler,
      test: async ({ fetch }) => {
        expect((await fetch({ method: 'POST', body: 'x' })).status).toBe(200);
        expect((await fetch({ method: 'POST', body: 'xx' })).status).toBe(413);
      }
    });
  });
});

describe('::isNextApiRequestWithRawBody', () => {
  it('functions properly as type predicate', async () => {
    expect.hasAssertions();

    const req = { rawBody: '' } as WithRawBody<NextApiRequest>;

    if (isNextApiRequestWithRawBody(req)) {
      // ? This test will "fail" during type checking if there is an error here
      expect(req.rawBody).toBe('');
    } else {
      // @ts-expect-error: test will "fail" during type checking if no error
      expect(req.rawBody).toBe('');
    }
  });
});

describe('::ensureNextApiRequestHasRawBody', () => {
  it('functions properly as type guard', async () => {
    expect.hasAssertions();

    const req = { rawBody: '' } as WithRawBody<NextApiRequest>;

    if (ensureNextApiRequestHasRawBody(req)) {
      // ? This test will "fail" during type checking if there is an error here
      expect(req.rawBody).toBe('');
    }
  });

  it('throws if NextApiRequest object does not have raw body', async () => {
    expect.hasAssertions();

    expect(() => ensureNextApiRequestHasRawBody({} as NextApiRequest)).toThrow(
      'encountered a NextApiRequest object without a rawBody property'
    );

    expect(() =>
      ensureNextApiRequestHasRawBody({ rawBody: '' } as WithRawBody<NextApiRequest>)
    ).not.toThrow();
  });
});
