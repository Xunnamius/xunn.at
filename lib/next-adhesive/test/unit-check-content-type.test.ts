import { testApiHandler } from 'next-test-api-route-handler';
import { noopHandler, withMockedOutput, wrapHandler } from 'testverse/setup';
import { withMiddleware } from 'multiverse/next-api-glue';
import randomizeCase from 'random-case';

import checkContentType, { Options } from 'multiverse/next-adhesive/check-content-type';

it('sends 415 by default for POST, PUT, and PATCH requests with or without a Content-Type header', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, { use: [checkContentType] })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'POST' })).status).toBe(415);
      expect((await fetch({ method: 'PUT' })).status).toBe(415);
      expect((await fetch({ method: 'PATCH' })).status).toBe(415);

      expect(
        (await fetch({ method: 'POST', headers: { 'content-type': 'a/j' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'PUT', headers: { 'content-type': 'a/j' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'PATCH', headers: { 'content-type': 'a/j' } })).status
      ).toBe(415);
    }
  });
});

it('sends 200 by default for requests not using POST, PUT, or PATCH methods if they do not have a Content-Type header', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, { use: [checkContentType] })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'GET' })).status).toBe(200);
      expect((await fetch({ method: 'HEAD' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT' })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS' })).status).toBe(200);
      expect((await fetch({ method: 'TRACE' })).status).toBe(200);
    }
  });
});

it('sends 415 by default for requests not using POST, PUT, or PATCH methods if they have a Content-Type header', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, { use: [checkContentType] })
    ),
    test: async ({ fetch }) => {
      expect(
        (await fetch({ method: 'GET', headers: { 'content-type': 'a/j' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'HEAD', headers: { 'content-type': 'a/j' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'DELETE', headers: { 'content-type': 'a/j' } })).status
      ).toBe(415);

      // expect(
      //   (await fetch({ method: 'CONNECT', headers: { 'content-type': 'a/j' } })).status
      // ).toBe(415);

      expect(
        (await fetch({ method: 'OPTIONS', headers: { 'content-type': 'a/j' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'TRACE', headers: { 'content-type': 'a/j' } })).status
      ).toBe(415);
    }
  });
});

it('sends 200 for POST, PUT, and PATCH requests with allowed Content-Type headers and 415 otherwise', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: ['a1', 'a2'] }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'POST' })).status).toBe(415);
      expect((await fetch({ method: 'PUT' })).status).toBe(415);
      expect((await fetch({ method: 'PATCH' })).status).toBe(415);

      expect(
        (await fetch({ method: 'POST', headers: { 'content-type': 'a1' } })).status
      ).toBe(200);

      expect(
        (await fetch({ method: 'PUT', headers: { 'content-type': 'a2' } })).status
      ).toBe(200);

      expect(
        (await fetch({ method: 'PATCH', headers: { 'content-type': 'a1' } })).status
      ).toBe(200);

      expect(
        (await fetch({ method: 'POST', headers: { 'content-type': 'a3' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'PUT', headers: { 'content-type': 'a3' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'PATCH', headers: { 'content-type': 'a3' } })).status
      ).toBe(415);
    }
  });

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: {
          allowedContentTypes: { POST: ['a1'], PUT: ['a2', 'a3'] }
        }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'POST' })).status).toBe(415);
      expect((await fetch({ method: 'PUT' })).status).toBe(415);
      expect((await fetch({ method: 'PATCH' })).status).toBe(415);

      expect(
        (await fetch({ method: 'POST', headers: { 'content-type': 'a1' } })).status
      ).toBe(200);

      expect(
        (await fetch({ method: 'PUT', headers: { 'content-type': 'a2' } })).status
      ).toBe(200);

      expect(
        (await fetch({ method: 'PATCH', headers: { 'content-type': 'a1' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'POST', headers: { 'content-type': 'a3' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'PUT', headers: { 'content-type': 'a3' } })).status
      ).toBe(200);

      expect(
        (await fetch({ method: 'PATCH', headers: { 'content-type': 'a3' } })).status
      ).toBe(415);
    }
  });
});

it(`ignores requests without a Content-Type header that aren't POST, PUT, or PATCH unless explicitly configured`, async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: ['a1', 'a2'] }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'GET' })).status).toBe(200);
      expect((await fetch({ method: 'HEAD' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT' })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS' })).status).toBe(200);
      expect((await fetch({ method: 'TRACE' })).status).toBe(200);

      expect((await fetch({ method: 'POST' })).status).toBe(415);
      expect((await fetch({ method: 'PUT' })).status).toBe(415);
      expect((await fetch({ method: 'PATCH' })).status).toBe(415);
    }
  });

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: {
          allowedContentTypes: { GET: ['a1'], POST: ['a1'], PUT: ['a2', 'a3'] }
        }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'GET' })).status).toBe(415);
      expect((await fetch({ method: 'HEAD' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT' })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS' })).status).toBe(200);
      expect((await fetch({ method: 'TRACE' })).status).toBe(200);

      expect((await fetch({ method: 'POST' })).status).toBe(415);
      expect((await fetch({ method: 'PUT' })).status).toBe(415);
      expect((await fetch({ method: 'PATCH' })).status).toBe(415);

      expect(
        (await fetch({ method: 'GET', headers: { 'content-type': 'a1' } })).status
      ).toBe(200);

      expect(
        (await fetch({ method: 'DELETE', headers: { 'content-type': 'a1' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'POST', headers: { 'content-type': 'a1' } })).status
      ).toBe(200);

      expect(
        (await fetch({ method: 'GET', headers: { 'content-type': 'a2' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'DELETE', headers: { 'content-type': 'a2' } })).status
      ).toBe(415);

      expect(
        (await fetch({ method: 'POST', headers: { 'content-type': 'a2' } })).status
      ).toBe(415);
    }
  });
});

it(`does not ignore requests that include a Content-Type header`, async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: ['a1', 'a2'] }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'GET' })).status).toBe(200);
      expect((await fetch({ method: 'HEAD' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT' })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS' })).status).toBe(200);
      expect((await fetch({ method: 'TRACE' })).status).toBe(200);

      let headers = { 'content-type': 'a1' };
      expect((await fetch({ method: 'GET', headers })).status).toBe(200);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(200);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(200);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(200);

      headers = { 'content-type': 'bad' };
      expect((await fetch({ method: 'GET', headers })).status).toBe(415);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(415);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(415);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(415);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(415);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(415);
    }
  });
});

it('respects explicit configuration for all request methods regardless of header presence', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: {
          allowedContentTypes: {
            GET: ['a1'],
            HEAD: ['a1'],
            POST: ['a1'],
            PUT: ['a1'],
            DELETE: ['a1'],
            CONNECT: ['a1'],
            OPTIONS: ['a1'],
            TRACE: ['a1'],
            PATCH: ['a1']
          }
        }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'GET' })).status).toBe(415);
      expect((await fetch({ method: 'HEAD' })).status).toBe(415);
      expect((await fetch({ method: 'DELETE' })).status).toBe(415);
      // expect((await fetch({ method: 'CONNECT' })).status).toBe(415);
      expect((await fetch({ method: 'OPTIONS' })).status).toBe(415);
      expect((await fetch({ method: 'TRACE' })).status).toBe(415);
      expect((await fetch({ method: 'POST' })).status).toBe(415);
      expect((await fetch({ method: 'PUT' })).status).toBe(415);
      expect((await fetch({ method: 'PATCH' })).status).toBe(415);

      let headers = { 'content-type': 'a1' };
      expect((await fetch({ method: 'GET', headers })).status).toBe(200);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(200);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(200);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(200);
      expect((await fetch({ method: 'POST', headers })).status).toBe(200);
      expect((await fetch({ method: 'PUT', headers })).status).toBe(200);
      expect((await fetch({ method: 'PATCH', headers })).status).toBe(200);

      headers = { 'content-type': 'bad' };
      expect((await fetch({ method: 'GET', headers })).status).toBe(415);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(415);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(415);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(415);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(415);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(415);
      expect((await fetch({ method: 'POST', headers })).status).toBe(415);
      expect((await fetch({ method: 'PUT', headers })).status).toBe(415);
      expect((await fetch({ method: 'PATCH', headers })).status).toBe(415);
    }
  });
});

it('ignores Content-Type header case for all requests', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: ['application/json'] }
      })
    ),
    test: async ({ fetch }) => {
      const headers = {
        get 'content-type'() {
          return randomizeCase('application/json');
        }
      };

      expect((await fetch({ method: 'GET', headers })).status).toBe(200);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(200);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(200);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(200);
      expect((await fetch({ method: 'POST', headers })).status).toBe(200);
      expect((await fetch({ method: 'PUT', headers })).status).toBe(200);
      expect((await fetch({ method: 'PATCH', headers })).status).toBe(200);
    }
  });
});

it('allows all (even missing) Content-Type header if set to "any"', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: 'any' }
      })
    ),
    test: async ({ fetch }) => {
      const headers = { 'content-type': 'application/json' };
      expect((await fetch({ method: 'GET', headers })).status).toBe(200);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(200);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(200);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(200);
      expect((await fetch({ method: 'POST', headers })).status).toBe(200);
      expect((await fetch({ method: 'PUT', headers })).status).toBe(200);
      expect((await fetch({ method: 'PATCH', headers })).status).toBe(200);

      expect((await fetch({ method: 'GET' })).status).toBe(200);
      expect((await fetch({ method: 'HEAD' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT' })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS' })).status).toBe(200);
      expect((await fetch({ method: 'TRACE' })).status).toBe(200);
      expect((await fetch({ method: 'POST' })).status).toBe(200);
      expect((await fetch({ method: 'PUT' })).status).toBe(200);
      expect((await fetch({ method: 'PATCH' })).status).toBe(200);
    }
  });

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: { GET: 'any', POST: 'any' } }
      })
    ),
    test: async ({ fetch }) => {
      const headers = { 'content-type': 'application/json' };
      expect((await fetch({ method: 'GET', headers })).status).toBe(200);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(415);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(415);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(415);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(415);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(415);
      expect((await fetch({ method: 'POST', headers })).status).toBe(200);
      expect((await fetch({ method: 'PUT', headers })).status).toBe(415);
      expect((await fetch({ method: 'PATCH', headers })).status).toBe(415);

      expect((await fetch({ method: 'GET' })).status).toBe(200);
      expect((await fetch({ method: 'HEAD' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT' })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS' })).status).toBe(200);
      expect((await fetch({ method: 'TRACE' })).status).toBe(200);
      expect((await fetch({ method: 'POST' })).status).toBe(200);
      expect((await fetch({ method: 'PUT' })).status).toBe(415);
      expect((await fetch({ method: 'PATCH' })).status).toBe(415);
    }
  });
});

it('requires all requests to be sent without a Content-Type header if set to "none"', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: 'none' }
      })
    ),
    test: async ({ fetch }) => {
      const headers = { 'content-type': 'application/json' };
      expect((await fetch({ method: 'GET', headers })).status).toBe(415);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(415);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(415);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(415);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(415);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(415);
      expect((await fetch({ method: 'POST', headers })).status).toBe(415);
      expect((await fetch({ method: 'PUT', headers })).status).toBe(415);
      expect((await fetch({ method: 'PATCH', headers })).status).toBe(415);

      expect((await fetch({ method: 'GET' })).status).toBe(200);
      expect((await fetch({ method: 'HEAD' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT' })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS' })).status).toBe(200);
      expect((await fetch({ method: 'TRACE' })).status).toBe(200);
      expect((await fetch({ method: 'POST' })).status).toBe(200);
      expect((await fetch({ method: 'PUT' })).status).toBe(200);
      expect((await fetch({ method: 'PATCH' })).status).toBe(200);
    }
  });

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: { POST: 'none' } }
      })
    ),
    test: async ({ fetch }) => {
      const headers = { 'content-type': 'application/json' };
      expect((await fetch({ method: 'GET', headers })).status).toBe(415);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(415);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(415);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(415);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(415);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(415);
      expect((await fetch({ method: 'POST', headers })).status).toBe(415);
      expect((await fetch({ method: 'PUT', headers })).status).toBe(415);
      expect((await fetch({ method: 'PATCH', headers })).status).toBe(415);

      expect((await fetch({ method: 'GET' })).status).toBe(200);
      expect((await fetch({ method: 'HEAD' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT' })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS' })).status).toBe(200);
      expect((await fetch({ method: 'TRACE' })).status).toBe(200);
      expect((await fetch({ method: 'POST' })).status).toBe(200);
      expect((await fetch({ method: 'PUT' })).status).toBe(415);
      expect((await fetch({ method: 'PATCH' })).status).toBe(415);
    }
  });
});

it('allows requests without a Content-Type header in addition to other constraints if array (as a mapped value or top-level) includes "none" value', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: ['none', 'application/json'] }
      })
    ),
    test: async ({ fetch }) => {
      const headers = { 'content-type': 'application/json' };
      expect((await fetch({ method: 'GET', headers })).status).toBe(200);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(200);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(200);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(200);
      expect((await fetch({ method: 'POST', headers })).status).toBe(200);
      expect((await fetch({ method: 'PUT', headers })).status).toBe(200);
      expect((await fetch({ method: 'PATCH', headers })).status).toBe(200);

      expect((await fetch({ method: 'GET' })).status).toBe(200);
      expect((await fetch({ method: 'HEAD' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT' })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS' })).status).toBe(200);
      expect((await fetch({ method: 'TRACE' })).status).toBe(200);
      expect((await fetch({ method: 'POST' })).status).toBe(200);
      expect((await fetch({ method: 'PUT' })).status).toBe(200);
      expect((await fetch({ method: 'PATCH' })).status).toBe(200);
    }
  });

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: { POST: ['none', 'application/json'] } }
      })
    ),
    test: async ({ fetch }) => {
      const headers = { 'content-type': 'application/json' };
      expect((await fetch({ method: 'GET', headers })).status).toBe(415);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(415);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(415);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(415);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(415);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(415);
      expect((await fetch({ method: 'POST', headers })).status).toBe(200);
      expect((await fetch({ method: 'PUT', headers })).status).toBe(415);
      expect((await fetch({ method: 'PATCH', headers })).status).toBe(415);

      expect((await fetch({ method: 'GET' })).status).toBe(200);
      expect((await fetch({ method: 'HEAD' })).status).toBe(200);
      expect((await fetch({ method: 'DELETE' })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT' })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS' })).status).toBe(200);
      expect((await fetch({ method: 'TRACE' })).status).toBe(200);
      expect((await fetch({ method: 'POST' })).status).toBe(200);
      expect((await fetch({ method: 'PUT' })).status).toBe(415);
      expect((await fetch({ method: 'PATCH' })).status).toBe(415);
    }
  });
});

it('sends 415 if Content-Type is literally the string "none"', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: ['none', 'application/json'] }
      })
    ),
    test: async ({ fetch }) => {
      const headers = { 'content-type': 'none' };
      expect((await fetch({ method: 'GET', headers })).status).toBe(415);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(415);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(415);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(415);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(415);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(415);
      expect((await fetch({ method: 'POST', headers })).status).toBe(415);
      expect((await fetch({ method: 'PUT', headers })).status).toBe(415);
      expect((await fetch({ method: 'PATCH', headers })).status).toBe(415);
    }
  });

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: { POST: ['none', 'application/json'] } }
      })
    ),
    test: async ({ fetch }) => {
      // ? Works even if strange case is used
      const headers = { 'content-type': 'NoNe' };
      expect((await fetch({ method: 'POST', headers })).status).toBe(415);
    }
  });
});

it('sends 400 is method is undefined', async () => {
  expect.hasAssertions();

  await testApiHandler({
    requestPatcher(req) {
      req.method = undefined;
    },
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: [randomizeCase('application/json')] }
      })
    ),
    test: async ({ fetch }) => {
      expect((await fetch({ method: 'GET' })).status).toBe(400);
    }
  });
});

it('works even if allowedContentTypes mapped value is strange or undefined', async () => {
  expect.hasAssertions();

  await withMockedOutput(async () => {
    await testApiHandler({
      rejectOnHandlerError: true,
      handler: wrapHandler(
        withMiddleware<Options>(noopHandler, {
          use: [checkContentType],
          options: { allowedContentTypes: { GET: undefined } }
        })
      ),
      async test({ fetch }) {
        expect((await fetch({ method: 'GET' })).status).toBe(200);
      }
    });

    await expect(
      testApiHandler({
        rejectOnHandlerError: true,
        handler: wrapHandler(
          withMiddleware<Options>(noopHandler, {
            use: [checkContentType],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            options: { allowedContentTypes: { GET: new BigInt64Array() as any } }
          })
        ),
        test: async ({ fetch }) => void (await fetch())
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        'allowedContentTypes must adhere to type constraints'
      )
    });
  });
});

it('works even if allowedContentTypes not specified in lowercase', async () => {
  expect.hasAssertions();

  await testApiHandler({
    handler: wrapHandler(
      withMiddleware<Options>(noopHandler, {
        use: [checkContentType],
        options: { allowedContentTypes: [randomizeCase('application/json')] }
      })
    ),
    test: async ({ fetch }) => {
      const headers = {
        get 'content-type'() {
          return randomizeCase('application/json');
        }
      };

      expect((await fetch({ method: 'GET', headers })).status).toBe(200);
      expect((await fetch({ method: 'HEAD', headers })).status).toBe(200);
      expect((await fetch({ method: 'DELETE', headers })).status).toBe(200);
      // expect((await fetch({ method: 'CONNECT', headers })).status).toBe(200);
      expect((await fetch({ method: 'OPTIONS', headers })).status).toBe(200);
      expect((await fetch({ method: 'TRACE', headers })).status).toBe(200);
      expect((await fetch({ method: 'POST', headers })).status).toBe(200);
      expect((await fetch({ method: 'PUT', headers })).status).toBe(200);
      expect((await fetch({ method: 'PATCH', headers })).status).toBe(200);
    }
  });
});
