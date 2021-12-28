import fetchActual from 'node-fetch';

import type { JsonObject } from 'type-fest';

export type FetchConfig = Omit<RequestInit, 'body'> & {
  swr?: boolean;
  rejects?: boolean;
  ignoreParseErrors?: boolean;
  body?: Record<string, unknown>;
};

/**
 * The default `config` all `fetch()` calls use by default. Will be merged
 * (overridden) with the `config` object passed into each call to `fetch()`, if
 * provided. See [fetch](https://npmjs.com/package/node-fetch) for valid
 * config keys.
 */
let globalFetchConfig: FetchConfig = {
  method: 'POST',
  // credentials: 'include', // ? If you want to send and receive cookies
  headers: { 'Content-Type': 'application/json' }
};

/**
 * Get the default config object merged in during all `fetch()` calls.
 */
export function getGlobalFetchConfig() {
  return globalFetchConfig;
}

/**
 * Set the default config object merged in during all `fetch()` calls.
 */
export function setGlobalFetchConfig(config: FetchConfig) {
  globalFetchConfig = config;
}

/**
 * Fetch a JSON response or immediately reject. Hence, `error` will always be
 * undefined and `json` will always be defined when this function returns.
 *
 * @example
 * ```
 * try {
 *   const { json } = fetch('https://some.resource.com/data.json', {
 *     rejects: true
 *   });
 *   doSomethingWith(json);
 * } catch(e) {
 *   // ...
 * }
 * ```
 *
 * @throws When a non-2xx response is received
 */
export async function fetch<
  JsonType extends JsonObject = JsonObject,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ErrorType extends JsonObject = JsonType
>(
  url: string,
  config: Omit<FetchConfig, 'rejects' | 'swr'> & {
    rejects: true;
    swr?: false;
  }
): Promise<{
  res: Response;
  json: JsonType;
  error: undefined;
}>;
/**
 * Fetch a JSON response or throw (expected by SWR).
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
 * @throws When a non-2xx response is received
 * @see https://swr.vercel.app
 */
export async function fetch<
  JsonType extends JsonObject = JsonObject,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ErrorType extends JsonObject = JsonType
>(
  url: string,
  config: Omit<FetchConfig, 'swr' | 'rejects'> & {
    swr: true;
    rejects?: false;
  }
): Promise<JsonType>;
/**
 * Fetch a resource.
 *
 * @returns
 * 1) A Response object `res` and parsed response body `json`
 * 2) `error` (`undefined` on 2xx response)
 *
 * Note: `json` is undefined on non-2xx responses while `error` is undefined on
 * 2xx responses.
 *
 * @example
 * ```
 *   const { json, error } = fetch.post<{ data: number }, { message: string }>(
 *     'api/endpoint',
 *     {
 *       headers: { key: apiKey },
 *       body: requestData,
 *       rejects: false // false is the default
 *     }
 *   );
 *
 *   if(error) throw error.message;
 *   return json.data;
 * ```
 *
 * @throws
 * When parsing the body for JSON content fails and `{ ignoreParseErrors: true }`
 */
export async function fetch<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(
  url: string,
  config?: FetchConfig
): Promise<{
  res: Response;
  json: JsonType | undefined;
  error: ErrorType | undefined;
}>;
export async function fetch<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(url: string, config?: FetchConfig): Promise<unknown> {
  const parsedOptions = {
    ...getGlobalFetchConfig(),
    ...(config?.swr ? { method: 'GET' } : {}),
    ...config,
    body: config?.body !== undefined ? JSON.stringify(config.body) : undefined
  };

  const res = await fetchActual(url, parsedOptions);
  let json: JsonType | undefined = undefined;
  let error: ErrorType | undefined = undefined;

  try {
    json = await res.json();
  } catch (err) {
    if (!parsedOptions?.ignoreParseErrors) throw err;
  }

  if (!res.ok) {
    error = json as ErrorType;
    json = undefined;

    if (parsedOptions?.swr || parsedOptions?.rejects) throw error;
  }

  return parsedOptions?.swr ? json : { res, json, error };
}

/**
 * Syntactic sugar for calling `fetch(..., { method: 'GET', ... })`.
 */
fetch.get = (<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(
  url: Parameters<typeof fetch>['0'],
  config?: Parameters<typeof fetch>['1']
) => {
  return fetch<JsonType, ErrorType>(url, {
    method: 'GET',
    ...config
  });
}) as typeof fetch;

/**
 * Syntactic sugar for calling `fetch(..., { method: 'PUT', ... })`.
 */
fetch.put = (<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(
  url: Parameters<typeof fetch>['0'],
  config?: Parameters<typeof fetch>['1']
) => {
  return fetch<JsonType, ErrorType>(url, {
    method: 'PUT',
    ...config
  });
}) as typeof fetch;

/**
 * Syntactic sugar for calling `fetch(..., { method: 'DELETE', ... })`.
 */
fetch.delete = (<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(
  url: Parameters<typeof fetch>['0'],
  config?: Parameters<typeof fetch>['1']
) => {
  return fetch<JsonType, ErrorType>(url, {
    method: 'DELETE',
    ...config
  });
}) as typeof fetch;

/**
 * Syntactic sugar for calling `fetch(..., { method: 'POST', ... })`.
 */
fetch.post = (<
  JsonType extends JsonObject = JsonObject,
  ErrorType extends JsonObject = JsonType
>(
  url: Parameters<typeof fetch>['0'],
  config?: Parameters<typeof fetch>['1']
) => {
  return fetch<JsonType, ErrorType>(url, {
    method: 'POST',
    ...config
  });
}) as typeof fetch;

/**
 * Syntactic sugar for SWR
 *
 * @see https://swr.vercel.app
 */
fetch.swr = async (key: string) => fetch(key, { swr: true });
