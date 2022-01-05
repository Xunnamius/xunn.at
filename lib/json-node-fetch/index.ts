import fetch, { FetchError, Headers, Response } from 'node-fetch';
import { makeNamedError } from 'named-app-errors';

import type { BodyInit, RequestInit } from 'node-fetch';
import type { JsonObject, JsonPrimitive } from 'type-fest';

const JsonContentType = 'application/json';

/**
 * Represents a JSON Fetch error.
 */
export class JsonFetchError<
  T extends JsonObject | JsonPrimitive | undefined
> extends FetchError {
  constructor(
    public readonly res: Response | undefined,
    public readonly json: T,
    message: string
  ) {
    super(message, 'json-fetch-error');
  }
}
makeNamedError(JsonFetchError, 'JsonFetchError');

/**
 * Options to configure how jsonFetch executes.
 *
 * @see https://github.com/node-fetch/node-fetch#options
 */
export type JsonRequestInit = Omit<RequestInit, 'body'> & {
  /**
   * If `true`, jsonFetch will reject when `response.ok` is not `true`; if
   * `false`, `json` will be undefined and `error` will be an empty object.
   *
   * @default false
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Response/ok
   */
  rejectIfNotOk?: boolean;
  /**
   * If `true`, jsonFetch will reject when a response is missing the
   * `application/json` content-type header; if `false`, `json` will be
   * undefined and `error` will be an empty object.
   *
   * @default false
   */
  rejectIfNonJsonContentType?: boolean;
  /**
   * The request body to send. Automatically stringified (via `JSON.stringify`)
   * if request content-type is `application/json`.
   *
   * Note that this type is loose enough to accept JSON objects, but if you're
   * not using the `application/json` content-type when passing a JSON object as
   * the body then jsonFetch will reject with an error.
   */
  body?: BodyInit | JsonObject | JsonPrimitive;
};

/**
 * The mutable default options for all `jsonFetch` calls. Keys will be
 * overridden by the optional `options` object passed into each call, e.g.
 * `jsonFetch(url, options)`.
 *
 * Note: you must use `credentials: 'include'` to include cookies with your
 * requests. This is not the default setting.
 *
 * @see https://github.com/node-fetch/node-fetch#options
 */
export const globalJsonRequestOptions: JsonRequestInit = {
  headers: { 'content-type': JsonContentType },
  rejectIfNotOk: false,
  rejectIfNonJsonContentType: false
};

/**
 * Fetches a resource and returns an object containing two items: the response
 * itself under `res` and the response body parsed as JSON under either `error`
 * (if the response has a non-2xx status) or `json`.
 *
 * If the response was not received with an `application/json` content-type
 * header or has a non-2xx status _and_ unparseable response body, `json` will
 * be undefined and `error` will be an empty object.
 *
 * This function rejects if 1) the request body cannot be parsed as JSON but is
 * being sent with an `application/json` content-type header or 2) the response
 * body cannot be parsed as JSON but was received with an `application/json`
 * content-type header.
 *
 * @example
 * ```
 * type ResJson = { myNumber: number };
 * type ResErr = { reason: string };
 * const { res, json, error } = await jsonFetch<ResJson, ResErr>(
 *   'api/endpoint',
 *   {
 *     method: 'POST',
 *     headers: { authorization: `Bearer ${apiKey}` },
 *     body: requestData
 *   }
 * );
 *
 * if (error) {
 *   console.error(error?.reason ?? (res.ok
 *       ? 'bad json'
 *       : res.statusText));
 * } else {
 *   console.log(`number is: ${json?.myNumber}`);
 * }
 * ```
 */
export async function jsonFetch<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(
  url: string,
  init?: Omit<JsonRequestInit, 'rejectIfNotOk' | 'rejectIfNonJsonContentType'> & {
    rejectIfNotOk?: false;
    rejectIfNonJsonContentType?: false;
  }
): Promise<{
  res: Response;
  json: JsonType | undefined;
  error: Partial<ErrorType> | undefined;
}>;
/**
 * Fetches a resource and returns an object containing two items: the response
 * itself under `res` and the response body parsed as JSON under either `error`
 * (if the response has a non-2xx status) or `json`.
 *
 * If the response was received with a non-2xx status _and_ unparseable response
 * body, `json` will be undefined and `error` will be an empty object.
 *
 * This function rejects if 1) the request body cannot be parsed as JSON but is
 * being sent with an `application/json` content-type header, 2) the response
 * body cannot be parsed as JSON but was received with an `application/json`
 * content-type header, or 3) the response was received with a content-type
 * header other than `application/json`.
 *
 * @example
 * ```
 * type ResJson = { myNumber: number };
 * type ResErr = { reason: string };
 *
 * try {
 *   const { res, json, error } = await jsonFetch<ResJson, ResErr>(
 *     'api/endpoint',
 *     { rejectIfNonJsonContentType: true }
 *   );
 *
 *   if (error) {
 *     console.error(error?.reason ?? res.statusText);
 *   } else {
 *     console.log(`number is: ${json?.myNumber}`);
 *   }
 * } catch(e) {
 *   if(e instanceof JsonFetchError) {
 *     // Special handling for non-json response bodies
 *     specialHandler(e.res.status, e.json);
 *   } else {
 *     throw e;
 *   }
 * }
 * ```
 */
export async function jsonFetch<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(
  url: string,
  init: Omit<JsonRequestInit, 'rejectIfNotOk' | 'rejectIfNonJsonContentType'> & {
    rejectIfNotOk?: false;
    rejectIfNonJsonContentType: true;
  }
): Promise<{
  res: Response;
  json: JsonType | undefined;
  error: Partial<ErrorType> | undefined;
}>;
/**
 * Fetches a resource and returns an object containing two items: the response
 * itself under `res` and either the response body parsed as JSON under `json`
 * or, if the response was received with a content-type header other than
 * `application/json`, an empty object under `error`.
 *
 * This function rejects if 1) the request body cannot be parsed as JSON but is
 * being sent with an `application/json` content-type header, 2) the response
 * body cannot be parsed as JSON but was received with an `application/json`
 * content-type header, or 3) the response was received with a non-2xx status.
 *
 * @example
 * ```
 * type ResJson = { myNumber: number };
 * type ResErr = { reason: string };
 *
 * try {
 *   const { res, json, error } = await jsonFetch<ResJson, ResErr>(
 *     'api/endpoint',
 *     { rejectIfNotOk: true }
 *   );
 *
 *   if (error) {
 *     console.error(error?.reason ?? 'bad json');
 *   } else {
 *     console.log(`number is: ${json?.myNumber}`);
 *   }
 * } catch(e) {
 *   if(e instanceof JsonFetchError) {
 *     // Special handling for non-2xx responses
 *     specialHandler(e.res.status, e.json);
 *   } else {
 *     throw e;
 *   }
 * }
 * ```
 */
export async function jsonFetch<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(
  url: string,
  init: Omit<JsonRequestInit, 'rejectIfNotOk' | 'rejectIfNonJsonContentType'> & {
    rejectIfNotOk: true;
    rejectIfNonJsonContentType?: false;
  }
): Promise<{
  res: Response;
  json: JsonType | undefined;
  error: Partial<ErrorType> | undefined;
}>;
/**
 * Fetches a resource and returns an object containing two items: the response
 * itself under `res` and and the response body parsed as JSON under `json`.
 *
 * This function rejects if 1) the request body cannot be parsed as JSON but is
 * being sent with an `application/json` content-type header, 2) the response
 * body cannot be parsed as JSON but was received with an `application/json`
 * content-type header, 3) the response was received with a content-type header
 * other than `application/json`, or 4) the response was received with a non-2xx
 * status.
 *
 * Hence, when jsonFetch is called in this way, `json` will always be defined
 * and `error` will always be undefined.
 *
 * @example
 * ```
 * try {
 *   const url = 'https://some.resource.com/data.json';
 *   const { json } = await jsonFetch(url, {
 *     rejectIfNotOk: true,
 *     rejectIfNonJsonContentType: true
 *   });
 *   doSomethingWith(json);
 * } catch(e) {
 *   if(e instanceof JsonFetchError) {
 *     // Special handling for non-2xx/non-json response bodies
 *     specialHandler(e.res.status, e.json);
 *   } else {
 *     throw e;
 *   }
 * }
 * ```
 */
export async function jsonFetch<
  JsonType extends JsonObject = JsonObject,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ErrorType extends JsonObject = JsonType
>(
  url: string,
  init: Omit<JsonRequestInit, 'rejectIfNotOk' | 'rejectIfNonJsonContentType'> & {
    rejectIfNotOk: true;
    rejectIfNonJsonContentType: true;
  }
): Promise<{
  res: Response;
  json: JsonType;
  error: undefined;
}>;
export async function jsonFetch<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(url: string, init?: JsonRequestInit): Promise<unknown> {
  const parsedOptions = {
    ...globalJsonRequestOptions,
    ...init
  };

  if (parsedOptions.headers) {
    parsedOptions.headers = new Headers(parsedOptions.headers);

    if (parsedOptions.headers.get('content-type') == JsonContentType) {
      try {
        parsedOptions.body = JSON.stringify(parsedOptions.body);
      } catch (e) {
        throw new JsonFetchError(
          undefined,
          undefined,
          `failed to stringify request body: ${e instanceof Error ? e.message : e}`
        );
      }
    }
  }

  const res = await fetch(url, parsedOptions as RequestInit);
  const responseContentType = res.headers.get('content-type');

  let parseError = '';
  let json: JsonType | undefined = undefined;
  let error: Partial<ErrorType> | undefined = undefined;

  try {
    json = await res.json();
  } catch (e) {
    parseError = `${e instanceof Error ? e.message : e}`;
  }

  if (!res.ok && parsedOptions.rejectIfNotOk) {
    throw new JsonFetchError(
      res,
      json,
      `response status code ${res.status} was not in the range 200-299`
    );
  }

  if (
    responseContentType != JsonContentType &&
    parsedOptions.rejectIfNonJsonContentType
  ) {
    throw new JsonFetchError(
      res,
      json,
      `received response ${
        responseContentType
          ? `with unexpected content-type "${responseContentType}"`
          : 'without a content-type'
      } (expected "application/json")`
    );
  }

  if (parseError && responseContentType == JsonContentType) {
    throw new JsonFetchError(res, json, `failed to parse response body: ${parseError}`);
  }

  if (responseContentType != JsonContentType || parseError) {
    json = undefined;
    error = {};
  } else if (!res.ok) {
    error = json as unknown as Partial<ErrorType>;
    json = undefined;
  }

  return { res, json, error };
}
