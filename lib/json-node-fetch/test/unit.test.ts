import { asMockedFunction } from '@xunnamius/jest-types';
import fetch, { Headers } from 'node-fetch';
import { globalJsonRequestOptions, jsonFetch } from 'multiverse/json-node-fetch';
import { JsonObject } from 'type-fest';
import { toss } from 'toss-expression';

import type { Response } from 'node-fetch';

jest.mock('node-fetch', () => {
  const fetch = jest.fn();
  // ? We need to mock Headers (earlier than when beforeEach runs)
  // @ts-expect-error: defining Headers
  fetch.Headers = jest.requireActual('node-fetch').Headers;
  // ? We also need to mock FetchError
  // @ts-expect-error: defining FetchError
  fetch.FetchError = jest.requireActual('node-fetch').FetchError;
  return fetch;
});

const mockedFetchResult = {} as unknown as Response;
let mockedFetchResultJson = {} as JsonObject | Error;

beforeEach(() => {
  asMockedFunction(fetch).mockImplementation(async () => mockedFetchResult);

  mockedFetchResult.ok = true;
  mockedFetchResult.status = 200;
  mockedFetchResult.headers = new Headers();

  mockedFetchResult.json = jest.fn(async () => {
    return mockedFetchResultJson instanceof Error
      ? toss(mockedFetchResultJson)
      : mockedFetchResultJson;
  });
});

describe('::jsonFetch', () => {
  it('fetches a resource and returns the response itself and the body as json', async () => {
    expect.hasAssertions();

    mockedFetchResult.headers.set('content-type', 'application/json');
    mockedFetchResultJson = { hello: 'world' };

    await expect(jsonFetch('some-url')).resolves.toStrictEqual({
      res: mockedFetchResult,
      json: mockedFetchResultJson,
      error: undefined
    });
  });

  it('rejects if the response has a non-json content-type', async () => {
    expect.hasAssertions();

    mockedFetchResultJson = { hello: 'world' };

    await expect(jsonFetch('some-url')).rejects.toThrow(
      'received response without a content-type (expected "application/json")'
    );

    mockedFetchResult.headers.set('content-type', 'something/else');

    await expect(jsonFetch('some-url')).rejects.toThrow(
      'received response with unexpected content-type "something/else" (expected "application/json")'
    );
  });

  it('returns undefined error/json if the response has a non-json content-type and allowAnyContentType is true', async () => {
    expect.hasAssertions();

    mockedFetchResult.headers.set('content-type', 'something/else');
    mockedFetchResultJson = { hello: 'world' };

    await expect(
      jsonFetch('some-url', { allowAnyContentType: true })
    ).resolves.toStrictEqual({
      res: mockedFetchResult,
      json: undefined,
      error: undefined
    });
  });

  it('rejects if the response has a json content-type but non-json body', async () => {
    expect.hasAssertions();

    mockedFetchResult.headers.set('content-type', 'application/json');
    mockedFetchResultJson = new SyntaxError('unexpected token ? in JSON at position ??');

    await expect(jsonFetch('some-url')).rejects.toThrow(
      'failed to parse response body: unexpected token ? in JSON at position ??'
    );

    // eslint-disable-next-line jest/unbound-method
    asMockedFunction(mockedFetchResult.json).mockImplementation(() => toss('string'));

    await expect(jsonFetch('some-url')).rejects.toThrow(
      'failed to parse response body: string'
    );
  });

  it('returns an error if the response has a non-2xx status code', async () => {
    expect.hasAssertions();

    mockedFetchResult.headers.set('content-type', 'application/json');
    mockedFetchResultJson = { hello: 'world!' };

    await expect(jsonFetch('some-url')).resolves.toStrictEqual({
      res: mockedFetchResult,
      json: mockedFetchResultJson,
      error: undefined
    });

    mockedFetchResult.ok = false;
    mockedFetchResult.status = 567;

    await expect(jsonFetch('some-url')).resolves.toStrictEqual({
      res: mockedFetchResult,
      json: undefined,
      error: mockedFetchResultJson
    });
  });

  it('rejects if the response has a non-2xx status code and rejectIfNotOk is true', async () => {
    expect.hasAssertions();

    globalJsonRequestOptions.rejectIfNotOk = true;

    try {
      mockedFetchResult.headers.set('content-type', 'application/json');
      mockedFetchResultJson = { hello: 'world!' };

      await expect(jsonFetch('some-url')).resolves.toStrictEqual({
        res: mockedFetchResult,
        json: mockedFetchResultJson,
        error: undefined
      });

      mockedFetchResult.ok = false;
      mockedFetchResult.status = 567;

      await expect(jsonFetch('some-url')).rejects.toThrow(
        'response status code 567 was not in the range 200-299'
      );

      // ? Should also reject with an HttpError even if JSON is not parsable

      // eslint-disable-next-line jest/unbound-method
      asMockedFunction(mockedFetchResult.json).mockImplementation(() => toss('string'));

      await expect(jsonFetch('some-url')).rejects.toThrow(
        'response status code 567 was not in the range 200-299'
      );
    } finally {
      delete globalJsonRequestOptions.rejectIfNotOk;
    }
  });

  it('rejects on failure to stringify request body with json content-type', async () => {
    expect.hasAssertions();

    mockedFetchResult.headers.set('content-type', 'application/json');

    const badObj = { badObj: {} };
    badObj.badObj = badObj;

    await expect(
      jsonFetch('some-url', {
        headers: { 'content-type': 'application/json' },
        body: 'hello'
      })
    ).resolves.toBeDefined();

    await expect(
      jsonFetch('some-url', {
        // headers: { 'content-type': 'application/json' }, // ? Default
        body: { hello: 'world' }
      })
    ).resolves.toBeDefined();

    await expect(
      jsonFetch('some-url', {
        headers: { 'content-type': 'something/else' },
        body: badObj
      })
    ).resolves.toBeDefined();

    await expect(
      jsonFetch('some-url', {
        // headers: { 'content-type': 'application/json' }, // ? Default
        body: badObj
      })
    ).rejects.toThrow('failed to stringify request body: ');

    jest.spyOn(JSON, 'stringify').mockImplementation(() => toss('string'));

    await expect(
      jsonFetch('some-url', {
        // headers: { 'content-type': 'application/json' }, // ? Default
        body: 'whatever'
      })
    ).rejects.toThrow('failed to stringify request body: string');
  });

  it('handles empty global options', async () => {
    expect.hasAssertions();

    const oldValue = globalJsonRequestOptions.headers;
    delete globalJsonRequestOptions.headers;

    try {
      mockedFetchResult.headers.set('content-type', 'application/json');
      mockedFetchResultJson = { hello: 'world' };

      await expect(jsonFetch('some-url')).resolves.toStrictEqual({
        res: mockedFetchResult,
        json: mockedFetchResultJson,
        error: undefined
      });
    } finally {
      globalJsonRequestOptions.headers = oldValue;
    }
  });
});
