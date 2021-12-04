import Cors from 'cors';
import { getEnv } from 'universe/backend/env';

import {
  sendHttpContrivedError,
  sendHttpUnauthenticated,
  sendHttpBadMethod,
  sendNotImplementedError,
  sendHttpError,
  sendHttpNotFound,
  sendHttpUnauthorized,
  sendHttpBadRequest,
  sendHttpRateLimited
} from 'multiverse/next-respond';

import {
  GuruMeditationError,
  NotFoundError,
  ItemNotFoundError,
  NotAuthorizedError,
  InvalidIdError,
  InvalidKeyError,
  ValidationError,
  AppError
} from 'universe/backend/error';

import {
  isKeyAuthentic,
  addToRequestLog,
  isDueForContrivedError,
  isRateLimited
} from 'universe/backend';

import type { NextApiRequest, NextApiResponse, PageConfig } from 'next';
import type { NextApiState } from 'types/global';

let cors: ReturnType<typeof Cors>;
const runCorsMiddleware = (req: NextApiRequest, res: NextApiResponse) => {
  cors = cors || Cors({ methods: ['GET', 'POST', 'PUT', 'DELETE'] });
  return new Promise((resolve, reject) =>
    cors(req, res, (r) => (r instanceof Error ? reject : resolve)(r))
  );
};

/**
 * @see https://nextjs.org/docs/api-routes/api-middlewares#custom-config
 */
export const defaultConfig: PageConfig = {
  api: {
    bodyParser: {
      get sizeLimit() {
        return getEnv().MAX_CONTENT_LENGTH_BYTES;
      }
    }
  }
};

export async function handleError(res: NextApiResponse, error: { message: string }) {
  const errorJson = error?.message ? { error: error.message } : {};

  if (error instanceof GuruMeditationError) {
    sendHttpError(res, {
      error: 'sanity check failed: please report exactly what you did just now!'
    });
  } else if (
    error instanceof InvalidIdError ||
    error instanceof InvalidKeyError ||
    error instanceof ValidationError
  ) {
    sendHttpBadRequest(res, errorJson);
  } else if (error instanceof NotAuthorizedError) {
    sendHttpUnauthorized(res, errorJson);
  } else if (error instanceof NotFoundError || error instanceof ItemNotFoundError) {
    sendHttpNotFound(res, errorJson);
  } else if (error instanceof AppError) {
    sendHttpError(res, errorJson);
  } else {
    sendHttpError(res);
  }
}

/**
 * Generic middleware "glue" to handle api endpoints with consistent behavior
 * like safe exception handling.
 *
 * Passing `undefined` as `handler` or not calling `res.send()` in your handler
 * will trigger an `HTTP 501 Not Implemented` response. This can be used to to
 * stub out endpoints for later implementation.
 */
export async function wrapHandler(
  handler: undefined | ((params: NextApiState) => Promise<void>),
  {
    req,
    res,
    methods,
    apiVersion
  }: NextApiState & {
    methods: string[];
    apiVersion?: number;
  }
) {
  const finalRes = res as typeof res & { $send: typeof res.send };
  // ? This will let us know if the send() method was called
  let sent = false;

  finalRes.$send = finalRes.send;
  finalRes.send = (...args) => {
    sent = true;
    void addToRequestLog({ req, res });
    finalRes.$send(...args);
  };

  try {
    // ? We need to pretend that the API doesn't exist if it's disabled, so
    // ? not even CORS responses are allowed here
    if (
      apiVersion !== undefined &&
      getEnv().DISABLED_API_VERSIONS.includes(apiVersion.toString())
    ) {
      sendHttpNotFound(finalRes);
    } else {
      await runCorsMiddleware(req, res);

      const { limited, retryAfter } = await isRateLimited(req);
      const { key } = req.headers;

      if (!getEnv().IGNORE_RATE_LIMITS && limited) {
        sendHttpRateLimited(finalRes, { retryAfter });
      } else if (
        getEnv().LOCKOUT_ALL_KEYS ||
        typeof key != 'string' ||
        !(await isKeyAuthentic(key))
      ) {
        sendHttpUnauthenticated(finalRes);
      } else if (
        !req.method ||
        getEnv().DISALLOWED_METHODS.includes(req.method) ||
        !methods.includes(req.method)
      ) {
        sendHttpBadMethod(finalRes);
      } else if (isDueForContrivedError()) {
        sendHttpContrivedError(finalRes);
      } else {
        handler && (await handler({ req, res: finalRes }));
        // ? If a response hasn't been sent, send one now
        !sent && sendNotImplementedError(finalRes);
      }
    }
  } catch (error) {
    await handleError(res, error as Error);
  }
}
