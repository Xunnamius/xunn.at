import unfetch from 'unfetch';
import { makeNamedError } from 'named-app-errors';
import type { JsonObject, JsonPrimitive } from 'type-fest';

const JsonContentType = 'application/json';

// ? Some types are being taken from TypeScript's global built-in DOM library

/**
 * Represents a JSON (un)Fetch error.
 */
export class JsonUnfetchError<
  T extends JsonObject | JsonPrimitive | undefined
> extends Error {
  constructor(
    public readonly res: Response | undefined,
    public readonly json: T,
    message: string
  ) {
    super(message);
  }
}
makeNamedError(JsonUnfetchError, 'JsonUnfetchError');

export type Response = Awaited<ReturnType<typeof unfetch>>;
export type RequestInit = NonNullable<Parameters<typeof unfetch>[1]>;
export type BodyInit = RequestInit['body'];

/**
 * Options to configure how jsonFetch executes.
 *
 * @see https://github.com/developit/unfetch#api
 */
export type JsonRequestInit = Omit<RequestInit, 'body'> & {
  /**
   * Enables SWR compatibility mode when `true`. Favor importing `swrFetch`, a
   * SWR syntactic sugar function, to use SWR compatibility rather than setting
   * this manually.
   *
   * @default false
   */
  swr?: boolean;
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
 * @see https://github.com/developit/unfetch#api
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
  init?: Omit<JsonRequestInit, 'swr' | 'rejectIfNotOk' | 'rejectIfNonJsonContentType'> & {
    swr?: false;
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
  init: Omit<JsonRequestInit, 'swr' | 'rejectIfNotOk' | 'rejectIfNonJsonContentType'> & {
    swr?: false;
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
  init: Omit<JsonRequestInit, 'swr' | 'rejectIfNotOk' | 'rejectIfNonJsonContentType'> & {
    swr?: false;
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
  init: Omit<JsonRequestInit, 'swr' | 'rejectIfNotOk' | 'rejectIfNonJsonContentType'> & {
    swr?: false;
    rejectIfNotOk: true;
    rejectIfNonJsonContentType: true;
  }
): Promise<{
  res: Response;
  json: JsonType;
  error: undefined;
}>;
/**
 * Fetches a resource and returns the response body parsed as a JSON object.
 *
 * This function rejects if 1) the request body cannot be parsed as JSON but is
 * being sent with an `application/json` content-type header, 2) the response
 * body cannot be parsed as JSON but was received with an `application/json`
 * content-type header, 3) the response was received with a content-type header
 * other than `application/json`, or 4) the response was received with a non-2xx
 * status.
 *
 * The object SWR returns will contain the rejection reason under the `error`
 * property. Usually, `error` is as an instance of JsonUnfetchError complete
 * with `json` and `res` properties. If unfetch itself fails, the `error`
 * object returned will not have these properties.
 *
 * @example
 * ```
 *   const { data: json, error } = useSwr('api/endpoint', swrFetch);
 *   // Or:                  ... = useSwr('api/endpoint', key => jsonFetch(key, { swr: true }));
 *
 *   if(error) <div>Error: {error.message}</div>;
 *   return <div>Hello, your data is: {json.data}</div>;
 * ```
 *
 * @see https://swr.vercel.app
 */
export async function jsonFetch<
  JsonType extends JsonObject = JsonObject,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ErrorType extends JsonObject = JsonType
>(url: string, init: Omit<JsonRequestInit, 'swr'> & { swr: true }): Promise<JsonType>;
export async function jsonFetch<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(url: string, init?: JsonRequestInit): Promise<unknown> {
  const parsedOptions = {
    ...globalJsonRequestOptions,
    ...(init?.swr ? { method: 'GET' } : {}),
    ...init
  };

  // ? A case-insensitive check since unfetch doesn't use a Headers instance
  const hasJsonContentType = !!Object.entries(parsedOptions.headers || {}).find(
    ([k, v]) => k.toLowerCase() == 'content-type' && v == JsonContentType
  );

  if (hasJsonContentType) {
    try {
      parsedOptions.body = JSON.stringify(parsedOptions.body);
    } catch (e) {
      throw new JsonUnfetchError(
        undefined,
        undefined,
        `failed to stringify request body: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  const res = await unfetch(url, parsedOptions as RequestInit);
  const responseContentType = res.headers.get('content-type');

  let parseError = '';
  let json: JsonType | undefined = undefined;
  let error: Partial<ErrorType> | undefined = undefined;

  try {
    json = await res.json();
  } catch (e) {
    parseError = `${e instanceof Error ? e.message : e}`;
  }

  if (!res.ok && (parsedOptions.rejectIfNotOk || parsedOptions.swr)) {
    throw new JsonUnfetchError(
      res,
      json,
      `response status code ${res.status} was not in the range 200-299`
    );
  }

  if (
    responseContentType != JsonContentType &&
    (parsedOptions.rejectIfNonJsonContentType || parsedOptions.swr)
  ) {
    throw new JsonUnfetchError(
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
    throw new JsonUnfetchError(res, json, `failed to parse response body: ${parseError}`);
  }

  if (responseContentType != JsonContentType || parseError) {
    json = undefined;
    error = {};
  } else if (!res.ok) {
    error = json as unknown as Partial<ErrorType>;
    json = undefined;
  }

  return parsedOptions.swr ? json : { res, json, error };
}

/**
 * Fetches a resource and returns the response body parsed as a JSON object.
 *
 * This function rejects if 1) the request body cannot be parsed as JSON but is
 * being sent with an `application/json` content-type header, 2) the response
 * body cannot be parsed as JSON but was received with an `application/json`
 * content-type header, 3) the response was received with a content-type header
 * other than `application/json`, or 4) the response was received with a non-2xx
 * status.
 *
 * The object SWR returns will contain the rejection reason under the `error`
 * property. Usually, `error` is as an instance of JsonUnfetchError complete
 * with `json` and `res` properties. If unfetch itself fails, the `error`
 * object returned will not have these properties.
 *
 * @example
 * ```
 *   const { data: json, error } = useSwr('api/endpoint', swrFetch);
 *
 *   if(error) <div>Error: {error.message}</div>;
 *   return <div>Hello, your data is: {json.data}</div>;
 * ```
 *
 * @see https://swr.vercel.app
 */
export function swrFetch<JsonType extends JsonObject = JsonObject>(
  init?: JsonRequestInit
): (key: string) => Promise<JsonType> {
  return (key) => {
    return jsonFetch<JsonType>(key, {
      ...init,
      swr: true
    });
  };
}
