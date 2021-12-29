import fetch from 'unfetch';
import { makeNamedError } from 'named-app-errors';
import type { JsonObject, JsonPrimitive } from 'type-fest';

/**
 * Represents a JSON (un)Fetch error.
 */
export class JsonUnfetchError<
  T extends JsonObject | JsonPrimitive | undefined
> extends Error {
  constructor(public readonly status: number, public readonly json: T) {
    super(`response status code "${status}" was not in the range 200-299`);
  }
}
makeNamedError(JsonUnfetchError, 'JsonUnfetchError');

/**
 * Options to configure how fetch executes.
 *
 * @see https://github.com/node-fetch/node-fetch#options
 */
export type JsonRequestInit = Partial<
  Omit<NonNullable<Parameters<typeof fetch>[1]>, 'body'> & {
    /**
     * Enable SWR compatibility mode when `true`.
     *
     * @default false
     */
    swr?: boolean;
    /**
     * If `true`, fetch will reject if `!response.ok`.
     *
     * @default false
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Response/ok
     */
    rejectIfNotOk?: boolean;
    /**
     * If `true`, fetch will not reject when failing to parse the response object
     * as JSON.
     *
     * @default false
     */
    ignoreParseErrors?: boolean;
    /**
     * The request body (as a JSON object).
     */
    body?: JsonObject;
  }
>;

/**
 * The default options for all `fetch` calls. Keys will be overridden by the
 * optional `options` object passed into each call, e.g. `fetch(url, options)`.
 *
 * Note: you must use `credentials: 'include'` to include cookies with your
 * requests. This is not the default setting.
 *
 * @see https://github.com/node-fetch/node-fetch#options
 */
export const globalJsonRequestOptions: JsonRequestInit = {
  headers: { 'Content-Type': 'application/json' }
};

/**
 * Fetches a resource and returns an object containing the response itself and
 * either the response body parsed as a JSON object or a JsonFetchError
 * instance.
 *
 * If a non-2xx response is received, the `json` property will be undefined;
 * conversely, if a 2xx response is received, the `error` property will be
 * undefined.
 *
 * This function only rejects if the request body cannot be parsed as JSON or if
 * the response body cannot be parsed as JSON _and `ignoreParseErrors` is
 * `false`_.
 *
 * @example
 * ```
 *   type XpectedJson = { data: number };
 *   type PotentialErr = { message: string };
 *   const { json, error } = fetch.post<XpectedJson, PotentialErr>(
 *     'api/endpoint',
 *     {
 *       headers: { authorization: `Bearer ${apiKey}` },
 *       body: requestData,
 *       // rejectIfNotOk: false // <== false is the default
 *     }
 *   );
 *
 *   if(error) throw error.message;
 *   return json.data;
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
 * Fetches a resource and returns an object containing the response itself and
 * the response body parsed as a JSON object. If a non-2xx response is received,
 * this function immediately rejects. Hence, if this function returns without
 * incident, `{ error }` will always be undefined and `{ json }` will always be
 * defined.
 *
 * @example
 * ```
 * try {
 *   const url = 'https://some.resource.com/data.json';
 *   const { json } = await fetch(url, { rejectIfNotOk: true });
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
 * Fetches a resource and returns the response body parsed as a JSON object. If
 * a non-2xx response is received, this function immediately rejects.
 *
 * @example
 * ```
 *   const { data: json, error } = useSwr('api/endpoint', fetch.swr);
 *   // Or:                  ... = useSwr('api/endpoint', key => fetch(key, { swr: true }));
 *
 *   if(error) <div>Error: {error.message}</div>;
 *   return <div>Hello, your data is: {json.data}</div>;
 * ```
 *
 * @see https://swr.vercel.app
 */
export async function jsonFetch<JsonType extends JsonObject = JsonObject>(
  url: string,
  init: Omit<JsonRequestInit, 'swr'> & { swr: true }
): Promise<JsonType>;
export async function jsonFetch<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(url: string, init?: JsonRequestInit): Promise<unknown> {
  const parsedOptions = {
    ...globalJsonRequestOptions,
    ...(init?.swr ? { method: 'GET' } : {}),
    ...init,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined
  };

  const res = await fetch(url, parsedOptions);
  let json: JsonType | undefined = undefined;
  let error: ErrorType | undefined = undefined;

  try {
    json = await res.json();
  } catch (err) {
    if (!parsedOptions?.ignoreParseErrors) throw err;
  }

  if (!res.ok) {
    error = json as unknown as ErrorType;
    json = undefined;

    if (parsedOptions?.swr || parsedOptions?.rejectIfNotOk) {
      throw new JsonUnfetchError(res.status, json);
    }
  }

  return parsedOptions?.swr ? json : { res, json, error };
}
