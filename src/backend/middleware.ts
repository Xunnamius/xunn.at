import { middlewareFactory } from 'multiverse/next-api-glue';

import logRequest, {
  Options as LogRequestOptions
} from 'multiverse/next-adhesive/log-request';

import authRequest, {
  Options as AuthRequestOptions
} from 'multiverse/next-adhesive/auth-request';

import checkVersion, {
  Options as CheckVersionOptions
} from 'multiverse/next-adhesive/check-version';

import useCors, {
  Options as UseCorsOptions
} from 'multiverse/next-adhesive/use-cors';

import limitRequest, {
  Options as LimitRequestOptions
} from 'multiverse/next-adhesive/limit-request';

import checkMethod, {
  Options as CheckMethodOptions
} from 'multiverse/next-adhesive/check-method';

import checkContentType, {
  Options as CheckContentTypeOptions
} from 'multiverse/next-adhesive/check-content-type';

import handleError, {
  Options as HandleErrorOptions
} from 'multiverse/next-adhesive/handle-error';

/**
 * Primary middleware runner for the REST API. Decorates a request handler.
 *
 * Passing `undefined` as `handler` or not calling `res.end()` (and not sending
 * headers) in your handler or use chain will trigger an `HTTP 501 Not
 * Implemented` response. This can be used to to stub out endpoints and their
 * middleware for later implementation.
 */
const withMiddleware = middlewareFactory<
  LogRequestOptions &
    CheckVersionOptions &
    UseCorsOptions &
    LimitRequestOptions &
    CheckMethodOptions &
    HandleErrorOptions
>({
  use: [logRequest, checkVersion, useCors, limitRequest, checkMethod],
  useOnError: [handleError],
  options: {}
});

/**
 * Middleware runner for the special /sys API endpoints. Decorates a request
 * handler.
 *
 * Passing `undefined` as `handler` or not calling `res.end()` (and not sending
 * headers) in your handler or use chain will trigger an `HTTP 501 Not
 * Implemented` response. This can be used to to stub out endpoints and their
 * middleware for later implementation.
 */
/* istanbul ignore next */
const withSysMiddleware = middlewareFactory<
  LogRequestOptions &
    AuthRequestOptions &
    LimitRequestOptions &
    CheckMethodOptions &
    CheckContentTypeOptions &
    HandleErrorOptions
>({
  use: [logRequest, authRequest, limitRequest, checkMethod, checkContentType],
  useOnError: [handleError],
  options: {}
});

export { withMiddleware, withSysMiddleware };
