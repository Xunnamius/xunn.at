import { middlewareFactory } from 'multiverse/next-api-glue';

import logRequest, {
  Options as LogRequestOptions
} from 'multiverse/next-adhesive/log-request';

import checkVersion, {
  Options as CheckVersionOptions
} from 'multiverse/next-adhesive/check-version';

import useCors, { Options as UseCorsOptions } from 'multiverse/next-adhesive/use-cors';

import limitRequest, {
  Options as LimitRequestOptions
} from 'multiverse/next-adhesive/limit-request';

import checkMethod, {
  Options as CheckMethodOptions
} from 'multiverse/next-adhesive/check-method';

import handleError, {
  Options as HandleErrorOptions
} from 'multiverse/next-adhesive/handle-error';

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
