import { toss } from 'toss-expression';
import { sendHttpError, sendNotImplementedError } from 'multiverse/next-api-respond';
import { name as pkgName } from 'package';
import debugFactory from 'debug';

import type { NextApiRequest, NextApiResponse } from 'next';

const debug = debugFactory(`${pkgName}:glue`);

export type Middleware = (
  req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext
) => Promise<void>;

export type MiddlewareContext = {
  /**
   * Contains middleware use chain control functions and metadata.
   */
  runtime: {
    /**
     * Call the next middleware function in the use chain. If not called
     * explicitly before a middleware function resolves, and `done()` was also
     * not called, `next()` will be called automatically. This means calling
     * `next()` in a middleware function is entirely optional.
     */
    readonly next: () => Promise<void>;
    /**
     * Stop calling middleware functions, effectively short-circuiting the use
     * chain. If `response.send` hasn't been called before calling this
     * function, it will be called automatically.
     */
    readonly done: () => void;
    /**
     * For middleware run via `useOnError`, the `error` property will contain
     * the thrown error object.
     */
    readonly error: unknown;
    /**
     * If `true`, `context.runtime.done` is called whenever `response.send` is
     * called.
     *
     * @default true
     */
    callDoneOnSend: boolean;
  };
  /**
   * Options expected by middleware functions at runtime.
   */
  options: Record<string, unknown>;
};

/**
 * Generic middleware runner. Decorates a request handler.
 *
 * Passing `undefined` as `handler` or not calling `res.send()` in your handler
 * or use chain will trigger an `HTTP 501 Not Implemented` response. This can be
 * used to to stub out endpoints and their middleware for later implementation.
 */
export function withMiddleware<
  Options extends Record<string, unknown> = Record<string, unknown>
>(
  handler: ((req: NextApiRequest, res: NextApiResponse) => Promise<void>) | undefined,
  {
    use,
    useOnError,
    options
  }: {
    use: Middleware[];
    useOnError?: Middleware[];
    options?: Options;
  }
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const middlewareContext: MiddlewareContext = {
      runtime: {
        next: () => toss(new Error('next() was called before it was ready')),
        done: () => toss(new Error('done() was called before it was ready')),
        error: undefined,
        callDoneOnSend: true
      },
      options: options || {}
    };

    /**
     * Async middleware chain iteration. Returns `true` if the chain was
     * actually pulled or `false` if it was empty.
     */
    const startPullingChain = async (chain: IterableIterator<Middleware>) => {
      let abort = false;
      let workWasDone = false;

      const pullChain = async () => {
        let chainWasPulled = false;
        const { value: currentMiddleware, done } = chain.next();

        // @ts-expect-error: next is readonly to everyone but us
        middlewareContext.runtime.next = async () => {
          if (!chainWasPulled) {
            chainWasPulled = true;
            debug('runtime.next: manually executing next middleware in chain');
            await pullChain();
          }
        };

        // @ts-expect-error: done is readonly to everyone but us
        middlewareContext.runtime.done = () => {
          debug('runtime.done: aborting middleware execution chain');
          abort = true;
        };

        if (!done) {
          if (currentMiddleware) {
            debug('executing middleware with context');
            await currentMiddleware(req, res, middlewareContext);
            workWasDone = true;
          }

          if (abort) {
            debug('execution chain aborted');
          } else if (!chainWasPulled) {
            debug('selecting next middleware in chain');
            await pullChain();
          }
        } else {
          debug('no more middleware to execute');
        }
      };

      await pullChain();
      debug('stopped middleware execution chain');
      debug(`at least one middleware executed: ${workWasDone ? 'yes' : 'no'}`);
      return workWasDone;
    };

    try {
      await startPullingChain(use[Symbol.iterator]());

      if (handler) {
        debug('executing handler');
        await handler(req, res);
      }
    } catch (e) {
      // @ts-expect-error: error is readonly to everyone but us
      middlewareContext.runtime.error = e;

      try {
        if (useOnError) {
          await startPullingChain(useOnError[Symbol.iterator]());
        }
      } catch (err) {
        // ? Error in error handler was unhandled
        debug.extend('<error>')(
          'unhandled exception in error handling middleware chain: %O',
          err
        );
      }

      // ? Error was unhandled
      if (!res.writableEnded) {
        debug.extend('<error>')('unhandled exception in primary middleware chain: %O', e);
        sendHttpError(res);
        throw e;
      }
    } finally {
      if (!res.writableEnded) {
        debug('res.end was not called: sending "not implemented" error');
        sendNotImplementedError(res);
      }
    }
  };
}

/**
 * Returns a `withMiddleware` function decorated with a preset configuration.
 * `withMiddleware` optionally accepts its usual parameters, which will be
 * appended onto the arguments to `withMiddlewareFactory` (the "preset
 * parameters"); however, note that passed option keys will overwrite their
 * preset counterparts.
 *
 * Useful when you don't want to repeatedly import, configure, and list a bunch
 * of middleware every time you want to call `withMiddleware`.
 */
export function middlewareFactory<
  Options extends Record<string, unknown> = Record<string, unknown>
>({
  use: defaultUse,
  useOnError: defaultUseOnError,
  options: defaultOptions
}: {
  use: Middleware[];
  useOnError?: Middleware[];
  options?: Options;
}) {
  return (
    handler: ((req: NextApiRequest, res: NextApiResponse) => Promise<void>) | undefined,
    params?: {
      use?: Middleware[];
      useOnError?: Middleware[];
      options?: Options;
    }
  ) => {
    const {
      use: passedUse,
      useOnError: passedUseOnError,
      options: passedOptions
    } = { ...params };

    return withMiddleware<Options>(handler, {
      use: [...defaultUse, ...(passedUse || [])],
      useOnError: [...(defaultUseOnError || []), ...(passedUseOnError || [])],
      options: { ...defaultOptions, ...passedOptions } as Options
    });
  };
}
