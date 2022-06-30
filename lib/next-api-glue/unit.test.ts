import { testApiHandler } from 'next-test-api-route-handler';
import { middlewareFactory, withMiddleware } from 'multiverse/next-api-glue';
import { withDebugEnabled, mockOutputFactory } from 'testverse/setup';
import { toss } from 'toss-expression';
import { DummyError } from 'universe/error';

import type { NextApiRequest, NextApiResponse, NextConfig } from 'next';
import type { Middleware, MiddlewareContext } from 'multiverse/next-api-glue';

const MAX_CONTENT_LENGTH_BYTES = 100000;
const MAX_CONTENT_LENGTH_BYTES_PLUS_1 = 100001;

const withMockedOutput = mockOutputFactory({ passthrough: { stdErrSpy: false } });

const noopHandler = async (_req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).send({});
};

describe('::withMiddleware', () => {
  it('throws on bad parameters', async () => {
    expect.hasAssertions();

    expect(() =>
      withMiddleware(async () => undefined, {
        // @ts-expect-error: testing bad param
        use: true
      })
    ).toThrow(/`use` parameter must be an array/);

    expect(() =>
      withMiddleware(async () => undefined, {
        use: [],
        // @ts-expect-error: testing bad param
        useOnError: true
      })
    ).toThrow(/`useOnError` parameter must be an array/);
  });

  it('rejects requests that are too big when exporting config (next.js)', async () => {
    expect.hasAssertions();

    const handler = withMiddleware(noopHandler, { use: [] }) as ReturnType<
      typeof withMiddleware
    > & { config: NextConfig };

    handler.config = {
      api: {
        bodyParser: {
          get sizeLimit() {
            return MAX_CONTENT_LENGTH_BYTES;
          }
        }
      }
    };

    await testApiHandler({
      rejectOnHandlerError: true,
      handler,
      test: async ({ fetch }) => {
        await expect(
          fetch({
            method: 'POST',
            body: 'x'.repeat(MAX_CONTENT_LENGTH_BYTES_PLUS_1)
          }).then((r) => r.status)
        ).resolves.toBe(413);
      }
    });
  });

  it('lowercases headers automatically', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: withMiddleware(
        async (req, res) => {
          res.status(req.headers.key == '1234' ? 200 : 555).send({});
        },
        { use: [] }
      ),
      test: async ({ fetch }) =>
        expect((await fetch({ headers: { KEY: '1234' } })).status).toBe(200)
    });
  });

  it('parses url parameters', async () => {
    expect.hasAssertions();

    await testApiHandler({
      requestPatcher: (req) => {
        req.url = '/?some=url&yes';
      },
      rejectOnHandlerError: true,
      handler: withMiddleware(
        async (req, res) => {
          expect(req.query).toStrictEqual({ some: 'url', yes: '' });
          res.status(200).send({});
        },
        { use: [] }
      ),
      test: async ({ fetch }) => {
        expect((await fetch()).status).toBe(200);
      }
    });
  });

  it('runs one middleware in primary chain', async () => {
    expect.hasAssertions();

    const middleware = jest.fn();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: withMiddleware(noopHandler, { use: [middleware] }),
      test: async ({ fetch }) => {
        expect((await fetch()).status).toBe(200);
        expect(middleware).toBeCalledTimes(1);
      }
    });
  });

  it('runs multiple middleware in primary chain', async () => {
    expect.hasAssertions();

    const middleware = [jest.fn(), jest.fn()];

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: withMiddleware(noopHandler, { use: middleware }),
      test: async ({ fetch }) => {
        expect((await fetch()).status).toBe(200);
        middleware.forEach((m) => expect(m).toBeCalledTimes(1));
      }
    });
  });

  it('runs primary chain middleware then handler', async () => {
    expect.hasAssertions();

    const middleware = jest.fn(() =>
      expect(handler).toBeCalledTimes(0)
    ) as Middleware;
    const handler = jest.fn(() => expect(middleware).toBeCalledTimes(1));

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: withMiddleware(handler, { use: [middleware] }),
      test: async ({ fetch }) => {
        await fetch();
        expect(middleware).toBeCalledTimes(1);
        expect(handler).toBeCalledTimes(1);
      }
    });
  });

  it('runs handler even if no middleware used', async () => {
    expect.hasAssertions();

    const handler = jest.fn();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: withMiddleware(handler, { use: [] }),
      test: async ({ fetch }) => {
        await fetch();
        expect(handler).toBeCalledTimes(1);
      }
    });
  });

  it('skips running handler if not a function', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      // @ts-expect-error: bad handler
      handler: withMiddleware(true, { use: [(_, res) => res.status(200).end()] }),
      test: async ({ fetch }) => {
        await fetch();
        expect((await fetch()).status).toBe(200);
      }
    });
  });

  it('skips running handler if primary chain was aborted', async () => {
    expect.hasAssertions();

    const handler = jest.fn();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: withMiddleware(handler, { use: [(_, __, ctx) => ctx.runtime.done()] }),
      test: async ({ fetch }) => {
        await fetch();
        expect(handler).toBeCalledTimes(0);
      }
    });

    await withMockedOutput(async () => {
      await expect(
        testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(handler, { use: [() => toss(new Error('bad'))] }),
          test: async ({ fetch }) => {
            await fetch();
          }
        })
      ).rejects.toMatchObject({ message: 'bad' });

      expect(handler).toBeCalledTimes(0);
    });
  });

  it('sends 501 if handler is undefined', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: withMiddleware(undefined, { use: [] }),
      test: async ({ fetch }) => expect((await fetch()).status).toBe(501)
    });
  });

  it('sends 501 if res.end not called by the time handler completes', async () => {
    expect.hasAssertions();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: withMiddleware(async () => undefined, { use: [] }),
      test: async ({ fetch }) => expect((await fetch()).status).toBe(501)
    });
  });

  it('only populates runtime.error for error handling middleware (and not primary)', async () => {
    expect.hasAssertions();

    const error = new Error('bad stuff happened');

    await withMockedOutput(async () => {
      await expect(
        testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(noopHandler, {
            use: [
              (_, __, ctx) => expect(ctx.runtime.error).toBeUndefined(),
              (_, __, ctx) => expect(ctx.runtime.error).toBeUndefined(),
              () => toss(error)
            ],
            useOnError: [
              (_, __, ctx) => expect(ctx.runtime.error).toBe(error),
              (_, __, ctx) => expect(ctx.runtime.error).toBe(error)
            ]
          }),
          test: async ({ fetch }) => void (await fetch())
        })
      ).toReject();
    });
  });

  it('runs one middleware in error handling chain on error in primary chain', async () => {
    expect.hasAssertions();

    const middleware = jest.fn();

    await withMockedOutput(async () => {
      await testApiHandler({
        rejectOnHandlerError: true,
        handler: withMiddleware(noopHandler, {
          use: [() => toss(new Error('error'))],
          useOnError: [middleware, (_, res) => res.end()]
        }),
        test: async ({ fetch }) => {
          await fetch();
          expect(middleware).toBeCalledTimes(1);
        }
      });
    });
  });

  it('runs multiple middleware in error handling chain on error in primary chain', async () => {
    expect.hasAssertions();

    const middleware = [jest.fn(), jest.fn(), ((_, res) => res.end()) as Middleware];

    await withMockedOutput(async () => {
      await testApiHandler({
        rejectOnHandlerError: true,
        handler: withMiddleware(noopHandler, {
          use: [() => toss(new Error('error'))],
          useOnError: middleware
        }),
        test: async ({ fetch }) => {
          await fetch();
          middleware.slice(0, -1).forEach((m) => expect(m).toBeCalledTimes(1));
        }
      });
    });
  });

  it('runs one middleware in error handling chain on error in handler', async () => {
    expect.hasAssertions();

    const middleware = jest.fn();

    await withMockedOutput(async () => {
      await testApiHandler({
        rejectOnHandlerError: true,
        handler: withMiddleware(() => toss(new Error('error')), {
          use: [],
          useOnError: [middleware, (_, res) => res.end()]
        }),
        test: async ({ fetch }) => {
          await fetch();
          expect(middleware).toBeCalledTimes(1);
        }
      });
    });
  });

  it('runs multiple middleware in error handling chain on error in handler', async () => {
    expect.hasAssertions();

    const middleware = [jest.fn(), jest.fn(), ((_, res) => res.end()) as Middleware];

    await withMockedOutput(async () => {
      await testApiHandler({
        rejectOnHandlerError: true,
        handler: withMiddleware(() => toss(new Error('error')), {
          use: [],
          useOnError: middleware
        }),
        test: async ({ fetch }) => {
          await fetch();
          middleware.slice(0, -1).forEach((m) => expect(m).toBeCalledTimes(1));
        }
      });
    });
  });

  it('skips remaining middleware if chain is aborted and aborts chain if runtime.done called', async () => {
    expect.hasAssertions();

    const middleware = jest.fn();

    await withMockedOutput(async () => {
      await testApiHandler({
        rejectOnHandlerError: true,
        handler: withMiddleware(noopHandler, {
          use: [(_, __, ctx) => ctx.runtime.done(), middleware, middleware],
          useOnError: [(_, __, ctx) => ctx.runtime.done(), middleware, middleware]
        }),
        test: async ({ fetch }) => {
          await fetch();
          expect(middleware).toBeCalledTimes(0);
        }
      });

      await expect(
        testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(noopHandler, {
            use: [() => toss(new Error('bad')), middleware, middleware],
            useOnError: [() => toss(new Error('bad')), middleware, middleware]
          }),
          test: async ({ fetch }) => {
            await fetch();
          }
        })
      ).toReject();

      expect(middleware).toBeCalledTimes(0);
    });
  });

  it('throws on error in error handling chain', async () => {
    expect.hasAssertions();

    await withMockedOutput(async () => {
      await expect(
        testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(undefined, {
            use: [() => toss(new Error('bad'))],
            useOnError: [() => toss(new Error('worse'))]
          }),
          test: async ({ fetch }) => {
            await fetch();
          }
        })
      ).rejects.toMatchObject({ message: 'worse' });
    });
  });

  it('throws on error in primary chain if no error handling middleware available', async () => {
    expect.hasAssertions();

    await withMockedOutput(async () => {
      await expect(
        testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(undefined, {
            use: [() => toss(new Error('bad'))],
            useOnError: []
          }),
          test: async ({ fetch }) => {
            await fetch();
          }
        })
      ).rejects.toMatchObject({ message: 'bad' });
    });
  });

  it('throws if res.end not called by the time error handling chain completes', async () => {
    expect.hasAssertions();

    await withMockedOutput(async () => {
      await expect(
        testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(undefined, {
            use: [() => toss(new Error('bad'))],
            useOnError: [() => undefined]
          }),
          test: async ({ fetch }) => {
            await fetch();
          }
        })
      ).rejects.toMatchObject({ message: 'bad' });
    });
  });

  it('makes runtime control functions noops if chain completes', async () => {
    expect.hasAssertions();

    const nextWarning = expect.stringContaining(
      'already finished executing; calling runtime.next() at this point is a noop'
    );

    const doneWarning = expect.stringContaining(
      'already finished executing; calling runtime.done() at this point is a noop'
    );

    let next: () => Promise<void>, done: () => void;

    await withDebugEnabled(async () => {
      await withMockedOutput(async ({ stdErrSpy }) => {
        await testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(
            async () => {
              expect(stdErrSpy).not.toBeCalledWith(nextWarning);
              expect(stdErrSpy).not.toBeCalledWith(doneWarning);

              await next();
              expect(stdErrSpy).toBeCalledWith(nextWarning);

              done();
              expect(stdErrSpy).toBeCalledWith(doneWarning);

              throw new Error('badness');
            },
            {
              options: { callDoneOnEnd: false },
              use: [
                (_req, _res, { runtime }) => {
                  next = runtime.next;
                  done = runtime.done;
                }
              ],
              useOnError: [
                (_req, res, { runtime }) => {
                  expect(runtime.error).toMatchObject({ message: 'badness' });

                  next = runtime.next;
                  done = runtime.done;
                  res.end();
                }
              ]
            }
          ),
          test: async ({ fetch }) => {
            await fetch();

            stdErrSpy.mockClear();

            await next();
            expect(stdErrSpy).toBeCalledWith(nextWarning);

            done();
            expect(stdErrSpy).toBeCalledWith(doneWarning);
          }
        });
      });
    });
  });

  it('makes runtime control functions noops if chain aborts', async () => {
    expect.hasAssertions();

    const nextWarning = expect.stringContaining(
      'aborted; calling runtime.next() at this point is a noop'
    );

    const doneWarning = expect.stringContaining(
      'already aborted; calling runtime.done() at this point is a noop'
    );

    let next: () => Promise<void>, done: () => void;

    await withDebugEnabled(async () => {
      await withMockedOutput(async ({ stdErrSpy }) => {
        await expect(
          testApiHandler({
            rejectOnHandlerError: true,
            handler: withMiddleware(undefined, {
              use: [
                (_req, _res, { runtime }) => {
                  next = runtime.next;
                  done = runtime.done;
                  throw new Error('aborted');
                }
              ],
              useOnError: [
                async (_req, _res, { runtime }) => {
                  expect(stdErrSpy).not.toBeCalledWith(nextWarning);
                  expect(stdErrSpy).not.toBeCalledWith(doneWarning);

                  await next();
                  expect(stdErrSpy).toBeCalledWith(nextWarning);

                  done();
                  expect(stdErrSpy).toBeCalledWith(doneWarning);

                  next = runtime.next;
                  done = runtime.done;

                  throw new Error('aborted again');
                }
              ]
            }),
            test: async ({ fetch }) => {
              await fetch();
            }
          })
        ).rejects.toMatchObject({ message: 'aborted again' });

        stdErrSpy.mockClear();

        await next();
        expect(stdErrSpy).toBeCalledWith(nextWarning);

        done();
        expect(stdErrSpy).toBeCalledWith(doneWarning);
      });
    });
  });

  it('can pull entire chain (and then some) manually using runtime.next', async () => {
    expect.hasAssertions();

    const nextWarning = expect.stringContaining(
      'already finished executing; calling runtime.next() at this point is a noop'
    );

    await withDebugEnabled(async () => {
      await withMockedOutput(async ({ stdErrSpy }) => {
        await testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(undefined, {
            use: [
              async (_req, res, { runtime: { next } }) => {
                await next();
                expect(stdErrSpy).not.toBeCalledWith(nextWarning);

                await next();
                expect(stdErrSpy).toBeCalledWith(nextWarning);

                stdErrSpy.mockClear();

                await next();
                expect(stdErrSpy).toBeCalledWith(nextWarning);

                res.status(200).end();
              }
            ]
          }),
          test: async ({ fetch }) => {
            expect((await fetch()).status).toBe(200);
          }
        });
      });
    });
  });

  it('can pull entire chain manually using runtime.next with warning if called multiple times', async () => {
    expect.hasAssertions();

    const middleware = jest.fn();
    const nextWarning = expect.stringContaining(
      'already finished executing; calling runtime.next() at this point is a noop'
    );

    await withMockedOutput(async ({ stdErrSpy }) => {
      await withDebugEnabled(async () => {
        await testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(undefined, {
            use: [
              async (_req, _res, { runtime: { next } }) => {
                await next();
                expect(stdErrSpy).not.toBeCalledWith(nextWarning);

                stdErrSpy.mockClear();

                await next();
                expect(stdErrSpy).toBeCalledWith(nextWarning);

                throw new Error('not good bad bad');
              },
              middleware,
              middleware
            ],
            useOnError: [
              async (_req, _res, { runtime: { next, error } }) => {
                expect(middleware).toBeCalledTimes(2);
                expect(error).toMatchObject({ message: 'not good bad bad' });
                stdErrSpy.mockClear();

                await next();
                expect(stdErrSpy).not.toBeCalledWith(nextWarning);

                stdErrSpy.mockClear();

                await next();
                expect(stdErrSpy).toBeCalledWith(
                  expect.stringContaining(
                    'aborted; calling runtime.next() at this point is a noop'
                  )
                );
              },
              middleware,
              middleware,
              (_, res) => {
                expect(middleware).toBeCalledTimes(4);
                res.status(200).end();
              }
            ]
          }),
          test: async ({ fetch }) => {
            expect((await fetch()).status).toBe(200);
          }
        });
      });
    });
  });

  it('skips non-function middleware in chain', async () => {
    expect.hasAssertions();

    await withDebugEnabled(async () => {
      await withMockedOutput(async ({ stdErrSpy }) => {
        await testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(undefined, {
            use: [
              // @ts-expect-error: bad middleware value
              'bad',
              // @ts-expect-error: bad middleware value
              null,
              // @ts-expect-error: bad middleware value
              {},
              (_, res) => res.status(403).end()
            ]
          }),
          test: async ({ fetch }) => {
            expect((await fetch()).status).toBe(403);
            expect(stdErrSpy).toBeCalledWith(
              expect.stringContaining(
                'skipping execution of non-function item in chain'
              )
            );
          }
        });
      });
    });
  });

  it('calls runtime.done on res.end only if options.callDoneOnEnd is true', async () => {
    expect.hasAssertions();

    const middleware = jest.fn();

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: withMiddleware(undefined, {
        use: [(_, res) => res.status(404).end(), middleware],
        options: { callDoneOnEnd: false }
      }),
      test: async ({ fetch }) => {
        expect((await fetch()).status).toBe(404);
        expect(middleware).toBeCalledTimes(1);
      }
    });

    await testApiHandler({
      rejectOnHandlerError: true,
      handler: withMiddleware(undefined, {
        use: [(_, res) => res.status(403).end(), middleware],
        options: { callDoneOnEnd: true }
      }),
      test: async ({ fetch }) => {
        expect((await fetch()).status).toBe(403);
        expect(middleware).toBeCalledTimes(1);
      }
    });
  });

  it('calls runtime.done on res.end only if chain was not aborted', async () => {
    expect.hasAssertions();

    const skippedMessage = expect.stringContaining('skipped calling runtime.done');

    await withDebugEnabled(async () => {
      await withMockedOutput(async ({ stdErrSpy }) => {
        await testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(undefined, {
            use: [
              async (_, res, { runtime: { done } }) => {
                done();
                expect(stdErrSpy).not.toBeCalledWith(skippedMessage);
                res.status(404).end();
                expect(stdErrSpy).toBeCalledWith(skippedMessage);
              }
            ]
          }),
          test: async ({ fetch }) => {
            expect((await fetch()).status).toBe(404);
          }
        });

        await testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(undefined, {
            use: [
              async () => {
                throw new Error('contrived');
              }
            ],
            useOnError: [
              async (_, res, { runtime: { done, error } }) => {
                expect(error).toMatchObject({ message: 'contrived' });

                done();

                stdErrSpy.mockClear();
                expect(stdErrSpy).not.toBeCalledWith(skippedMessage);
                res.status(404).end();
                expect(stdErrSpy).toBeCalledWith(skippedMessage);
              }
            ]
          }),
          test: async ({ fetch }) => {
            expect((await fetch()).status).toBe(404);
          }
        });
      });
    });
  });

  it('calls runtime.done on res.end only if chain has not already completed', async () => {
    expect.hasAssertions();

    const skippedMessage = expect.stringContaining('skipped calling runtime.done');

    await withDebugEnabled(async () => {
      await withMockedOutput(async ({ stdErrSpy }) => {
        await testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(
            async (_, res) => {
              expect(stdErrSpy).not.toBeCalledWith(skippedMessage);
              res.status(404).end();
              expect(stdErrSpy).toBeCalledWith(skippedMessage);
            },
            {
              use: []
            }
          ),
          test: async ({ fetch }) => {
            expect((await fetch()).status).toBe(404);
          }
        });
      });
    });
  });

  it('does not call runtime.done on res.end if response was already sent', async () => {
    expect.hasAssertions();

    const skippedMessage = expect.stringContaining('skipped calling runtime.done');

    await withDebugEnabled(async () => {
      await withMockedOutput(async ({ stdErrSpy }) => {
        await testApiHandler({
          rejectOnHandlerError: true,
          handler: withMiddleware(
            async (_, res) => {
              expect(stdErrSpy).not.toBeCalledWith(skippedMessage);
              res.status(404).end();
              expect(stdErrSpy).toBeCalledWith(skippedMessage);
              stdErrSpy.mockClear();
              expect(stdErrSpy).not.toBeCalledWith(skippedMessage);
              res.status(404).end();
              expect(stdErrSpy).not.toBeCalledWith(skippedMessage);
            },
            {
              use: []
            }
          ),
          test: async ({ fetch }) => {
            expect((await fetch()).status).toBe(404);
          }
        });
      });
    });
  });

  it('supports type generics', async () => {
    expect.assertions(0);

    type myMiddlewareOptions = { customOption: boolean };

    const myMiddleware = (
      _: NextApiRequest,
      res: NextApiResponse,
      { options: { customOption } }: MiddlewareContext<myMiddlewareOptions>
    ) => {
      res.status(200).send(customOption);
    };

    const myPartialMiddleware = (
      _: NextApiRequest,
      res: NextApiResponse,
      { options: { customOption } }: MiddlewareContext<Partial<myMiddlewareOptions>>
    ) => {
      res.status(200).send(customOption);
    };

    withMiddleware(undefined, {
      // @ts-expect-error: MiddlewareContext != MiddlewareContext<myMiddlewareOptions>
      use: [myMiddleware]
    });

    withMiddleware<myMiddlewareOptions>(undefined, {
      use: [myMiddleware]
      // TODO: improve TypeScript skills to enforce required options here
    });

    withMiddleware<myMiddlewareOptions>(undefined, {
      use: [myMiddleware],
      // @ts-expect-error: missing required property: customOption
      options: {}
    });

    withMiddleware<myMiddlewareOptions>(undefined, {
      use: [myMiddleware],
      // @ts-expect-error: bad type for required property: customOption
      options: { customOption: 5 }
    });

    withMiddleware<myMiddlewareOptions & { anotherOpt: boolean }>(undefined, {
      use: [
        myMiddleware,
        (_, __, { options: { anotherOpt } }) => {
          void anotherOpt;
        }
      ],
      // @ts-expect-error: missing required property: anotherOpt
      options: { customOption: true }
    });

    withMiddleware(undefined, {
      use: [myPartialMiddleware]
    });

    withMiddleware<Partial<myMiddlewareOptions>>(undefined, {
      use: [myPartialMiddleware],
      options: {}
    });
  });
});

describe('::middlewareFactory', () => {
  it('returns a pre-configured withMiddleware instance', async () => {
    expect.hasAssertions();

    type myMiddlewareOptions = { customOption: boolean };

    const myMiddleware = (
      _: NextApiRequest,
      res: NextApiResponse,
      { options: { customOption } }: MiddlewareContext<myMiddlewareOptions>
    ) => {
      res.status(200).send({ customOption });
    };

    const customOption = true;

    const handler = middlewareFactory<myMiddlewareOptions>({
      use: [myMiddleware],
      options: { customOption }
    })(undefined);

    await testApiHandler({
      handler,
      test: async ({ fetch }) => {
        await expect((await fetch()).json()).resolves.toStrictEqual({ customOption });
      }
    });
  });

  it('handles appending and prepending to middleware chains', async () => {
    expect.hasAssertions();

    type myMiddlewareOptions = { customOption: boolean };

    const myMiddleware = (
      _: NextApiRequest,
      res: NextApiResponse,
      { options: { customOption } }: MiddlewareContext<myMiddlewareOptions>
    ) => {
      res.status(200).send({ customOption });
    };

    const customOption = true;

    await testApiHandler({
      handler: middlewareFactory<myMiddlewareOptions>({
        use: [myMiddleware],
        options: { customOption }
      })(undefined, { prependUse: [(_, res) => res.status(201).send({ a: 1 })] }),
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(201);
        await expect(res.json()).resolves.toStrictEqual({ a: 1 });
      }
    });

    await testApiHandler({
      handler: middlewareFactory({
        use: [(_, res) => void res.status(202)]
      })(undefined, { appendUse: [(_, res) => res.send({ b: 1 })] }),
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(202);
        await expect(res.json()).resolves.toStrictEqual({ b: 1 });
      }
    });

    await testApiHandler({
      handler: middlewareFactory<myMiddlewareOptions>({
        use: [myMiddleware],
        options: { customOption }
      })(undefined, {
        prependUse: [() => toss(new DummyError('bad bad not good'))],
        prependUseOnError: [(_, res) => void res.status(203)],
        appendUseOnError: [(_, res) => res.send({ c: 1 })]
      }),
      test: async ({ fetch }) => {
        const res = await fetch();
        expect(res.status).toBe(203);
        await expect(res.json()).resolves.toStrictEqual({ c: 1 });
      }
    });
  });

  it('supports type generics', async () => {
    expect.assertions(0);

    type myMiddlewareOptions = { customOption: boolean };

    const myMiddleware = (
      _: NextApiRequest,
      res: NextApiResponse,
      { options: { customOption } }: MiddlewareContext<myMiddlewareOptions>
    ) => {
      res.status(200).send(customOption);
    };

    const myPartialMiddleware = (
      _: NextApiRequest,
      res: NextApiResponse,
      { options: { customOption } }: MiddlewareContext<Partial<myMiddlewareOptions>>
    ) => {
      res.status(200).send(customOption);
    };

    // @ts-expect-error: MiddlewareContext != MiddlewareContext<myMiddlewareOptions>
    middlewareFactory({ use: [myMiddleware] })(undefined);

    middlewareFactory<myMiddlewareOptions>({ use: [myMiddleware] })(undefined);

    middlewareFactory<myMiddlewareOptions>({
      use: [myMiddleware],
      // @ts-expect-error: missing required property: customOption
      options: {}
    })(undefined);

    middlewareFactory<myMiddlewareOptions>({
      use: [myMiddleware],
      // @ts-expect-error: bad type for required property: customOption
      options: { customOption: 5 }
    })(undefined);

    middlewareFactory<myMiddlewareOptions & { anotherOpt: boolean }>({
      use: [
        myMiddleware,
        (_, __, { options: { anotherOpt } }) => {
          void anotherOpt;
        }
      ],
      // @ts-expect-error: missing required property: anotherOpt
      options: { customOption: true }
    })(undefined);

    middlewareFactory({
      use: [myPartialMiddleware]
    })(undefined);

    middlewareFactory<Partial<myMiddlewareOptions>>({
      use: [myPartialMiddleware],
      options: {}
    })(undefined);

    middlewareFactory({
      use: [myPartialMiddleware]
    })(undefined, {
      // @ts-expect-error: MiddlewareContext != MiddlewareContext<myMiddlewareOptions>
      appendUse: [myMiddleware]
    });

    middlewareFactory({
      use: [myPartialMiddleware]
    })(undefined, {
      appendUse: [myPartialMiddleware],
      appendUseOnError: [myPartialMiddleware]
    });

    middlewareFactory<myMiddlewareOptions>({
      use: [myPartialMiddleware]
    })(undefined, {
      prependUse: [myMiddleware],
      prependUseOnError: [myMiddleware]
    });

    middlewareFactory<myMiddlewareOptions>({
      use: [myPartialMiddleware]
    })(undefined, {
      // @ts-expect-error: bad type for required property: customOption
      options: { customOption: 5 }
    });
  });
});
