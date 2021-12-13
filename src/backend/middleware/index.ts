import { middlewareFactory } from 'multiverse/next-api-glue';

import logRequest, {
  Options as LogRequestOptions
} from 'universe/backend/middleware/log-request';

import checkVersion, {
  Options as CheckVersionOptions
} from 'universe/backend/middleware/check-version';

import useCors, { Options as UseCorsOptions } from 'universe/backend/middleware/use-cors';

import limitRequest, {
  Options as LimitRequestOptions
} from 'universe/backend/middleware/limit-request';

import checkMethod, {
  Options as CheckMethodOptions
} from 'universe/backend/middleware/check-method';

import handleError, {
  Options as HandleErrorOptions
} from 'universe/backend/middleware/handle-error';

const withMiddleware = middlewareFactory<
  LogRequestOptions &
    CheckVersionOptions &
    UseCorsOptions &
    LimitRequestOptions &
    CheckMethodOptions &
    HandleErrorOptions
>({
  use: [logRequest, checkVersion, useCors, limitRequest, checkMethod],
  useOnError: [handleError]
});

export { withMiddleware };
