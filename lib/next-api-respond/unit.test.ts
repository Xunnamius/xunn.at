import {
  sendGenericHttpResponse,
  sendHttpBadMethod,
  sendHttpBadRequest,
  sendHttpContrivedError,
  sendHttpError,
  sendHttpOk,
  sendHttpErrorResponse,
  sendHttpNotFound,
  sendHttpRateLimited,
  sendHttpSuccessResponse,
  sendHttpTooLarge,
  sendHttpUnauthenticated,
  sendHttpUnauthorized,
  sendNotImplemented,
  sendHttpBadContentType
} from 'multiverse/next-api-respond';
import { testApiHandler } from 'next-test-api-route-handler';

describe('::sendGenericHttpResponse', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendGenericHttpResponse(res, 201);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(201);
        await expect(res.json()).resolves.toStrictEqual({});
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendGenericHttpResponse(res, 201, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(201);
        await expect(res.json()).resolves.toStrictEqual({ json: 'data' });
      }
    });
  });

  it('sends application/json header', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendGenericHttpResponse(res, 200);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toStartWith('application/json');
      }
    });
  });
});

describe('::sendHttpBadMethod', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpBadMethod(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(405);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'bad method'
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpBadMethod(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(405);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'bad method',
          json: 'data'
        });
      }
    });
  });
});

describe('::sendHttpBadRequest', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpBadRequest(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'request was malformed or otherwise bad'
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpBadRequest(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'request was malformed or otherwise bad',
          json: 'data'
        });
      }
    });
  });
});

describe('::sendHttpContrivedError', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpContrivedError(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(555);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: '(note: do not report this contrived error)'
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpContrivedError(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(555);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: '(note: do not report this contrived error)',
          json: 'data'
        });
      }
    });
  });
});

describe('::sendHttpError', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpError(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(500);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: '🤯 something unexpected happened on our end 🤯'
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpError(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(500);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: '🤯 something unexpected happened on our end 🤯',
          json: 'data'
        });
      }
    });
  });
});

describe('::sendHttpOk', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpOk(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toStrictEqual({
          success: true
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpOk(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toStrictEqual({
          success: true,
          json: 'data'
        });
      }
    });
  });
});

describe('::sendHttpErrorResponse', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpErrorResponse(res, 400, { json: 'data', error: 'error' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          json: 'data',
          error: 'error'
        });
      }
    });
  });
});

describe('::sendHttpNotFound', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpNotFound(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(404);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'resource was not found'
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpNotFound(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(404);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'resource was not found',
          json: 'data'
        });
      }
    });
  });
});

describe('::sendHttpRateLimited', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpRateLimited(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(429);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'client is rate limited'
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpRateLimited(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(429);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'client is rate limited',
          json: 'data'
        });
      }
    });
  });
});

describe('::sendHttpSuccessResponse', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpSuccessResponse(res, 202);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(202);
        await expect(res.json()).resolves.toStrictEqual({
          success: true
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpSuccessResponse(res, 202, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(202);
        await expect(res.json()).resolves.toStrictEqual({
          success: true,
          json: 'data'
        });
      }
    });
  });
});

describe('::sendHttpTooLarge', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpTooLarge(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(413);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'request body is too large'
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpTooLarge(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(413);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'request body is too large',
          json: 'data'
        });
      }
    });
  });
});

describe('::sendHttpBadContentType', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpBadContentType(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(415);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'request payload is in an unsupported format'
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpBadContentType(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(415);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'request payload is in an unsupported format',
          json: 'data'
        });
      }
    });
  });
});

describe('::sendHttpUnauthenticated', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpUnauthenticated(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(401);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'client is not authenticated'
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpUnauthenticated(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(401);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'client is not authenticated',
          json: 'data'
        });
      }
    });
  });
});

describe('::sendHttpUnauthorized', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendHttpUnauthorized(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(403);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'client is not authorized to access this resource'
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendHttpUnauthorized(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(403);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'client is not authorized to access this resource',
          json: 'data'
        });
      }
    });
  });
});

describe('::sendNotImplemented', () => {
  it('sends appropriate response given arguments', async () => {
    expect.hasAssertions();

    await testApiHandler({
      handler: (_, res) => {
        sendNotImplemented(res);
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(501);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'this endpoint has not yet been implemented'
        });
      }
    });

    await testApiHandler({
      handler: (_, res) => {
        sendNotImplemented(res, { json: 'data' });
      },
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(501);
        await expect(res.json()).resolves.toStrictEqual({
          success: false,
          error: 'this endpoint has not yet been implemented',
          json: 'data'
        });
      }
    });
  });
});
