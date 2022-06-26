import type { NextApiResponse } from 'next';
import type { HttpStatusCode, JsonSuccess, JsonError } from '@xunnamius/types';

/**
 * Sends a generic HTTP response with the given `statusCode` and optional
 * `responseJson` body (defaults to `{}`). This is the "base" function called by
 * all other response functions.
 */
export function sendGenericHttpResponse(
  res: NextApiResponse,
  statusCode: HttpStatusCode,
  responseJson?: Record<string, unknown>
) {
  res
    .setHeader('content-type', 'application/json')
    .status(statusCode)
    .send(responseJson || {});
}

/**
 * Sends a generic "success" response and `responseJson` body, optionally with
 * additional properties. This function is called by all 2xx response functions.
 */
export function sendHttpSuccessResponse(
  res: NextApiResponse,
  statusCode: HttpStatusCode,
  responseJson?: Record<string, unknown>
) {
  const json: JsonSuccess = { ...responseJson, success: true };
  sendGenericHttpResponse(res, statusCode, json);
  return json;
}

/**
 * Sends a generic "error" response and `responseJson` body, optionally with
 * additional properties. This function is called by all non-2xx response
 * functions.
 */
export function sendHttpErrorResponse(
  res: NextApiResponse,
  statusCode: HttpStatusCode,
  responseJson: Record<string, unknown> & { error: string }
) {
  const json: JsonError = { ...responseJson, success: false };
  sendGenericHttpResponse(res, statusCode, json);
  return json;
}

/**
 * Sends an HTTP 200 "ok" response with optional `responseJson` data.
 */
export function sendHttpOk(res: NextApiResponse, responseJson?: Record<string, unknown>) {
  sendHttpSuccessResponse(res, 200, responseJson);
}

/**
 * Sends an HTTP 400 "client error" response with optional `responseJson` data.
 */
export function sendHttpBadRequest(
  res: NextApiResponse,
  responseJson?: Record<string, unknown>
) {
  sendHttpErrorResponse(res, 400, {
    error: 'request was malformed or otherwise bad',
    ...responseJson
  });
}

/**
 * Sends an HTTP 401 "unauthenticated" response with optional `responseJson`
 * data.
 */
export function sendHttpUnauthenticated(
  res: NextApiResponse,
  responseJson?: Record<string, unknown>
) {
  sendHttpErrorResponse(res, 401, {
    error: 'client is not authenticated',
    ...responseJson
  });
}

/**
 * Sends an HTTP 403 "forbidden" ("unauthorized") response with optional
 * `responseJson` data.
 */
export function sendHttpUnauthorized(
  res: NextApiResponse,
  responseJson?: Record<string, unknown>
) {
  sendHttpErrorResponse(res, 403, {
    error: 'client is not authorized to access this resource',
    ...responseJson
  });
}

/**
 * Sends an HTTP 404 "not found" response with optional `responseJson` data.
 */
export function sendHttpNotFound(
  res: NextApiResponse,
  responseJson?: Record<string, unknown>
) {
  sendHttpErrorResponse(res, 404, {
    error: 'resource was not found',
    ...responseJson
  });
}

/**
 * Sends an HTTP 405 "bad method" response with optional `responseJson` data.
 */
export function sendHttpBadMethod(
  res: NextApiResponse,
  responseJson?: Record<string, unknown>
) {
  sendHttpErrorResponse(res, 405, {
    error: 'bad method',
    ...responseJson
  });
}

/**
 * Sends an HTTP 413 "too big" response with optional `responseJson` data.
 */
export function sendHttpTooLarge(
  res: NextApiResponse,
  responseJson?: Record<string, unknown>
) {
  sendHttpErrorResponse(res, 413, {
    error: 'request body is too large',
    ...responseJson
  });
}

/**
 * Sends an HTTP 415 "unsupported media type" response with optional
 * `responseJson` data.
 */
export function sendHttpBadContentType(
  res: NextApiResponse,
  responseJson?: Record<string, unknown>
) {
  sendHttpErrorResponse(res, 415, {
    error: 'request payload is in an unsupported format',
    ...responseJson
  });
}

/**
 * Sends an HTTP 429 "too many requests" response with optional `responseJson`
 * data.
 */
export function sendHttpRateLimited(
  res: NextApiResponse,
  responseJson?: Record<string, unknown>
) {
  sendHttpErrorResponse(res, 429, {
    error: 'client is rate limited',
    ...responseJson
  });
}

/**
 * Sends a generic HTTP 500 "error" response with `error` property and optional
 * `responseJson` data.
 */
export function sendHttpError(
  res: NextApiResponse,
  responseJson?: Record<string, unknown>
) {
  sendHttpErrorResponse(res, 500, {
    error: '🤯 something unexpected happened on our end 🤯',
    ...responseJson
  });
}

/**
 * Sends an HTTP 501 "not implemented" response with optional `responseJson`
 * data.
 */
export function sendNotImplemented(
  res: NextApiResponse,
  responseJson?: Record<string, unknown>
) {
  sendHttpErrorResponse(res, 501, {
    error: 'this endpoint has not yet been implemented',
    ...responseJson
  });
}

/**
 * Sends an HTTP 555 "contrived" response with optional `responseJson` data.
 */
export function sendHttpContrivedError(
  res: NextApiResponse,
  responseJson?: Record<string, unknown>
) {
  sendHttpErrorResponse(res, 555, {
    error: '(note: do not report this contrived error)',
    success: false,
    ...responseJson
  });
}
