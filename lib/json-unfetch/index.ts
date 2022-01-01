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
    public readonly status: number | undefined,
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
   * If `true`, jsonFetch will reject if `response.ok` is not `true`.
   *
   * @default false
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Response/ok
   */
  rejectIfNotOk?: boolean;
  /**
   * If `true`, jsonFetch will not return an error when a response is missing
   * the `application/json` content-type header; in this case, both `json` and
   * `error` will be undefined, leaving you to examine `res` manually.
   *
   * @default false
   */
  allowAnyContentType?: boolean;
  /**
   * The request body to send. Automatically stringified (via `JSON.stringify`)
   * if request content-type is `application/json`.
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
  headers: { 'content-type': JsonContentType }
};

/**
 * Fetches a resource and returns an object containing two items: the response
 * itself (under `res`) and the response body parsed as JSON (under either
 * `json` or `error` depending on status code).
 *
 * If the response was not received with an `application/json` content-type
 * header and `allowAnyContentType` is `true`, both `error` and `json` will be
 * undefined. Otherwise, if the response has a non-2xx status, the `json`
 * property will be undefined; conversely, if a 2xx status is received, the
 * `error` property will be undefined.
 *
 * This function rejects 1) if the request body cannot be parsed as JSON but is
 * being sent with an `application/json` content-type header, 2) the response
 * was not received with an `application/json` content-type header but
 * `allowAnyContentType` is not `true`, or 3) the response body cannot be parsed
 * as JSON but is being sent with an `application/json` content-type header.
 *
 * @example
 * ```
 * type ExpectedJson = { data: number };
 * type PotentialErr = { message: string };
 * const { json, error } = jsonFetch<ExpectedJson, PotentialErr>(
 *   'api/endpoint',
 *   {
 *     headers: { authorization: `Bearer ${apiKey}` },
 *     body: requestData
 *   }
 * );
 *
 * if(error) throw new Error(error.reason);
 * return json.myData;
 * ```
 */
export async function jsonFetch<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(
  url: string,
  init?: Omit<JsonRequestInit, 'swr' | 'rejectIfNotOk'> & {
    swr?: false;
    rejectIfNotOk?: false;
  }
): Promise<{
  res: Response;
  json: JsonType | undefined;
  error: ErrorType | undefined;
}>;
/**
 * Fetches a resource and returns an object containing two items: the response
 * itself (under `res`) and the response body parsed as JSON (under either
 * `json` or `error` depending on status code).
 *
 * If the response was not received with an `application/json` content-type
 * header and `allowAnyContentType` is `true`, both `error` and `json` will be
 * undefined.
 *
 * If a response with a proper content-type header is received but with a
 * non-2xx status, this function will reject. Hence, if this function returns
 * without incident, `error` will always be undefined and `json` will always be
 * defined (with respect to the constraints above).
 *
 * This function also rejects 1) if the request body cannot be parsed as JSON
 * but is being sent with an `application/json` content-type header, 2) the
 * response was not received with an `application/json` content-type header but
 * `allowAnyContentType` is not `true`, or 3) the response body cannot be parsed
 * as JSON but is being sent with an `application/json` content-type header.
 *
 * @example
 * ```
 * try {
 *   const url = 'https://some.resource.com/data.json';
 *   const { json } = await jsonFetch(url, { rejectIfNotOk: true });
 *   doSomethingWith(json);
 * } catch(e) {
 *   // ...
 * }
 * ```
 */
export async function jsonFetch<
  JsonType extends JsonObject = JsonObject,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ErrorType extends JsonObject = JsonType
>(
  url: string,
  init: Omit<JsonRequestInit, 'swr' | 'rejectIfNotOk'> & {
    swr?: false;
    rejectIfNotOk: true;
  }
): Promise<{
  res: Response;
  json: JsonType;
  error: undefined;
}>;
/**
 * Fetches a resource and returns the response body parsed as a JSON object.
 *
 * If the response was not received with an `application/json` content-type
 * header and `allowAnyContentType` is `true`, both `error` and `json` will be
 * undefined.
 *
 * This function rejects 1) if a response with a proper content-type header is
 * received but with a non-2xx status, 2) if the request body cannot be parsed
 * as JSON but is being sent with an `application/json` content-type header, 3)
 * the response was not received with an `application/json` content-type header
 * but `allowAnyContentType` is not `true`, or 4) the response body cannot be
 * parsed as JSON but is being sent with an `application/json` content-type
 * header.
 *
 * The object SWR returns will contain the rejection reason under the `error`
 * property. Usually, `error` is as an instance of JsonUnfetchError complete
 * with `json` and `status` properties. If unfetch itself fails, the `error`
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

  const res = await unfetch(url, parsedOptions);
  const responseContentType = res.headers.get('content-type');

  let json: JsonType | undefined = undefined;
  let error: ErrorType | undefined = undefined;

  if (responseContentType == JsonContentType) {
    try {
      json = await res.json();
    } catch (e) {
      throw new JsonUnfetchError(
        res.status,
        json,
        `failed to parse response body: ${e instanceof Error ? e.message : e}`
      );
    }
  } else if (!parsedOptions.allowAnyContentType) {
    throw new JsonUnfetchError(
      res.status,
      json,
      `received response ${
        responseContentType
          ? `with unexpected content-type "${responseContentType}"`
          : 'without a content-type'
      } (expected "application/json")`
    );
  }

  if (!res.ok) {
    error = json as unknown as ErrorType;
    json = undefined;

    if (parsedOptions.swr || parsedOptions.rejectIfNotOk) {
      throw new JsonUnfetchError(
        res.status,
        json,
        `response status code ${res.status} was not in the range 200-299`
      );
    }
  }

  return parsedOptions.swr ? json : { res, json, error };
}

/**
 * Fetches a resource and returns the response body parsed as a JSON object.
 *
 * If the response was not received with an `application/json` content-type
 * header and `allowAnyContentType` is `true`, both `error` and `json` will be
 * undefined.
 *
 * This function rejects 1) if a response with a proper content-type header is
 * received but with a non-2xx status, 2) if the request body cannot be parsed
 * as JSON but is being sent with an `application/json` content-type header, 3)
 * the response was not received with an `application/json` content-type header
 * but `allowAnyContentType` is not `true`, or 4) the response body cannot be
 * parsed as JSON but is being sent with an `application/json` content-type
 * header.
 *
 * The object SWR returns will contain the rejection reason under the `error`
 * property. Usually, `error` is as an instance of JsonUnfetchError complete
 * with `json` and `status` properties. If unfetch itself fails, the `error`
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
