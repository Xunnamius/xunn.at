import { toss } from 'toss-expression';
import { sendNotImplementedError } from 'multiverse/next-api-respond';
import { debugFactory } from 'multiverse/debug-extended';

import type { Debugger } from 'multiverse/debug-extended';
import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import type { NoInfer } from '@xunnamius/types';
import type { Promisable } from 'type-fest';

const debug = debugFactory('next-api-glue:runtime');

export type Middleware<
  Options extends Record<string, unknown> = Record<string, unknown>
> = (
  req: NextApiRequest,
  res: NextApiResponse,
  context: MiddlewareContext<Options>
) => Promisable<void>;

export type MiddlewareContext<
  Options extends Record<string, unknown> = Record<string, unknown>
> = {
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
     * chain. If `response.end` hasn't been called before calling this function,
     * it will be called automatically.
     *
     * When using this function to abort execution of the primary middleware
     * chain, the final handler will also be skipped.
     */
    readonly done: () => void;
    /**
     * For middleware run via `useOnError`, the `error` property will contain
     * the thrown error object.
     */
    readonly error: unknown;
  };
  /**
   * Options expected by middleware functions at runtime.
   */
  options: Options & {
    /**
     * If `true`, `context.runtime.done` is called whenever `response.end` is
     * called. If `false`, the entire primary middleware chain will always run
     * to completion, even if the response has already been sent before it
     * completes.
     *
     * @default true
     */
    callDoneOnEnd: boolean;
  };
};

/**
 * Generic middleware runner. Decorates a request handler.
 *
 * Passing `undefined` as `handler` or not calling `res.end()` in your handler
 * or use chain will trigger an `HTTP 501 Not Implemented` response. This can be
 * used to to stub out endpoints and their middleware for later implementation.
 */
export function withMiddleware<
  Options extends Record<string, unknown> = Record<string, unknown>
>(
  handler: NextApiHandler | undefined,
  {
    use,
    useOnError,
    options
  }: {
    use: Middleware<NoInfer<Options>>[];
    useOnError?: Middleware<NoInfer<Options>>[];
    options?: Partial<MiddlewareContext<NoInfer<Options>>['options']> & NoInfer<Options>;
  }
) {
  if (!Array.isArray(use)) {
    throw new Error('withMiddleware `use` parameter must be an array');
  }

  if (useOnError && !Array.isArray(useOnError)) {
    throw new Error('withMiddleware `useOnError` parameter must be an array');
  }

  return async (req: NextApiRequest, res: NextApiResponse) => {
    const middlewareContext: MiddlewareContext<NoInfer<Options>> = {
      runtime: {
        next: () => toss(new Error('runtime.next was called unexpectedly')),
        done: () => toss(new Error('runtime.done was called unexpectedly')),
        error: undefined
      },
      options: { callDoneOnEnd: true, ...options } as MiddlewareContext<
        NoInfer<Options>
      >['options']
    };

    /**
     * Async middleware chain iteration. Returns `true` if execution was aborted
     * or `false` otherwise.
     */
    const startPullingChain = async (
      chain: IterableIterator<Middleware<NoInfer<Options>>>,
      localDebug: Debugger
    ) => {
      let executionWasAborted = false;
      let ranAtLeastOneMiddleware = false;

      localDebug(
        middlewareContext.options.callDoneOnEnd
          ? 'chain will call runtime.done after res.end automatically'
          : 'chain will NOT automatically call runtime.done after res.end'
      );

      try {
        const pullChain = async () => {
          let chainWasPulled = false;
          const { value: currentMiddleware, done } = chain.next();

          // @ts-expect-error: next is readonly to everyone but us
          middlewareContext.runtime.next = async () => {
            if (chainWasPulled) {
              debug.warn(
                'runtime.next: the next middleware in this chain was already executed; calling runtime.next() at this point is a no-op!'
              );
            } else if (executionWasAborted) {
              debug.warn(
                'runtime.next: this chain was aborted; calling runtime.next() at this point is a no-op!'
              );
            } else {
              chainWasPulled = true;
              localDebug('runtime.next: manually executing next middleware in chain');
              await pullChain();
            }
          };

          // @ts-expect-error: done is readonly to everyone but us
          middlewareContext.runtime.done = () => {
            if (!executionWasAborted) {
              localDebug('runtime.done: aborting middleware execution chain');
              executionWasAborted = true;
            } else {
              debug.warn(
                'runtime.abort: this chain was already aborted; calling runtime.abort() at this point is a no-op!'
              );
            }
          };

          if (middlewareContext.options.callDoneOnEnd) {
            const send = res.end;
            res.end = ((...args: Parameters<typeof res.end>) => {
              const sent = res.writableEnded;
              send(...args);

              if (!executionWasAborted && !sent) {
                localDebug('calling runtime.done after initial call to res.end');
                middlewareContext.runtime.done();
              }
            }) as typeof res.end;
          }

          if (!done) {
            if (typeof currentMiddleware == 'function') {
              localDebug('executing middleware');
              await currentMiddleware(req, res, middlewareContext);
              ranAtLeastOneMiddleware = true;
            } else {
              debug.warn('skipping execution of non-function item in middleware array');
            }

            if (executionWasAborted) {
              localDebug('execution chain aborted manually');
            } else if (!chainWasPulled) {
              localDebug('selecting next middleware in chain');
              await pullChain();
            }
          } else {
            localDebug('no more middleware to execute');
          }
        };

        await pullChain();
        localDebug('stopped middleware execution chain');
        localDebug(
          `at least one middleware executed: ${ranAtLeastOneMiddleware ? 'yes' : 'no'}`
        );
        return executionWasAborted;
      } catch (e) {
        executionWasAborted = true;
        debug.error('execution chain aborted due to error');
        throw e;
      }
    };

    try {
      let primaryChainWasAborted = false;
      try {
        debug('selecting first middleware in primary middleware chain');
        primaryChainWasAborted = await startPullingChain(use[Symbol.iterator](), debug);
      } catch (e) {
        debug('error in primary middleware chain');
        throw e;
      }

      if (handler) {
        if (primaryChainWasAborted) {
          debug('not executing handler since primary chain execution was aborted');
        } else {
          debug('executing handler');
          await handler(req, res);
        }
      } else {
        debug('no handler found');
      }

      if (!res.writableEnded) {
        debug.extend('cleanup')(
          'res.end was not called: sending "not implemented" error'
        );
        sendNotImplementedError(res);
      }
    } catch (e) {
      debug.error('attempting to handle error: %O', e);

      // @ts-expect-error: error is readonly to everyone but us
      middlewareContext.runtime.error = e;
      if (useOnError) {
        try {
          debug.error('selecting first middleware in error handling middleware chain');
          await startPullingChain(useOnError[Symbol.iterator](), debug.error);
        } catch (err) {
          // ? Error in error handler was unhandled
          debug.error('error in error handling middleware chain: %O', err);
          debug.error('throwing unhandled error');
          throw err;
        }
      } else {
        debug.error('no error handling middleware found');
        debug.error('throwing unhandled error');
        throw e;
      }

      // ? Error was unhandled, kick it up to the caller (usually Next itself)
      if (!res.writableEnded) {
        debug.error('throwing unhandled error');
        throw e;
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
  use: Middleware<NoInfer<Options>>[];
  useOnError?: Middleware<NoInfer<Options>>[];
  options?: Partial<MiddlewareContext<NoInfer<Options>>['options']> & NoInfer<Options>;
}) {
  return (
    handler: NextApiHandler | undefined,
    params?: {
      use?: Middleware<NoInfer<Options>>[];
      useOnError?: Middleware<NoInfer<Options>>[];
      options?: Partial<MiddlewareContext<NoInfer<Options>>['options']>;
    }
  ) => {
    const {
      use: passedUse,
      useOnError: passedUseOnError,
      options: passedOptions
    } = { ...params };

    return withMiddleware<NoInfer<Options>>(handler, {
      use: [...defaultUse, ...(passedUse || [])],
      useOnError: [...(defaultUseOnError || []), ...(passedUseOnError || [])],
      options: { ...defaultOptions, ...passedOptions } as Partial<
        MiddlewareContext<NoInfer<Options>>['options']
      > &
        NoInfer<Options>
    });
  };
}
