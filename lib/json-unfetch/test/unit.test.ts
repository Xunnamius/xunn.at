import { asMockedFunction } from '@xunnamius/jest-types';
import unfetch from 'unfetch';
import {
  globalJsonRequestOptions,
  jsonFetch,
  swrFetch
} from 'multiverse/json-unfetch';
import { JsonObject } from 'type-fest';
import { toss } from 'toss-expression';

import type { Response } from 'multiverse/json-unfetch';

jest.mock('unfetch');

const mockFetch = asMockedFunction(unfetch);

const mockedFetchResult = {} as unknown as Omit<Response, 'headers'> & {
  headers: Response['headers'] & {
    set: (k: string, v: string) => void;
  };
};

let mockedFetchResultJson = {} as JsonObject | Error | string;

beforeEach(() => {
  mockFetch.mockImplementation(async () => mockedFetchResult);
  mockedFetchResultJson = { hello: 'world!' };
  mockedFetchResult.ok = true;
  mockedFetchResult.status = 200;
  mockedFetchResult.headers =
    new Map() as unknown as typeof mockedFetchResult['headers'];

  mockedFetchResult.json = jest.fn(async () => {
    return typeof mockedFetchResultJson == 'string' ||
      mockedFetchResultJson instanceof Error
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

  it('returns empty error if the response has a non-json content-type', async () => {
    expect.hasAssertions();

    mockedFetchResultJson = { hello: 'world' };

    await expect(jsonFetch('some-url')).resolves.toStrictEqual({
      res: mockedFetchResult,
      json: undefined,
      error: {}
    });

    mockedFetchResult.headers.set('content-type', 'something/else');

    await expect(jsonFetch('some-url')).resolves.toStrictEqual({
      res: mockedFetchResult,
      json: undefined,
      error: {}
    });
  });

  it('rejects if the response has a non-json content-type and rejectIfNonJsonContentType is true', async () => {
    expect.hasAssertions();

    mockedFetchResultJson = { hello: 'world' };

    await expect(
      jsonFetch('some-url', { rejectIfNonJsonContentType: true })
    ).rejects.toThrow(
      'received response without a content-type (expected "application/json")'
    );

    mockedFetchResult.headers.set('content-type', 'something/else');

    await expect(
      jsonFetch('some-url', { rejectIfNonJsonContentType: true })
    ).rejects.toThrow(
      'received response with unexpected content-type "something/else" (expected "application/json")'
    );
  });

  it('rejects if the response has a json content-type but non-json body regardless of status code', async () => {
    expect.hasAssertions();

    mockedFetchResult.headers.set('content-type', 'application/json');
    mockedFetchResultJson = new SyntaxError(
      'unexpected token ? in JSON at position ??'
    );

    await expect(jsonFetch('some-url')).rejects.toThrow(
      'failed to parse response body: unexpected token ? in JSON at position ??'
    );

    mockedFetchResultJson = 'unexpected token ?? in JSON at position ?';

    await expect(jsonFetch('some-url')).rejects.toThrow(
      'failed to parse response body: unexpected token ?? in JSON at position ?'
    );

    mockedFetchResult.ok = false;
    mockedFetchResult.status = 413;

    await expect(jsonFetch('some-url')).rejects.toThrow(
      'failed to parse response body: unexpected token ?? in JSON at position ?'
    );
  });

  it('returns error if the response has a non-2xx status code', async () => {
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

  it('returns empty error if the response has a non-2xx status code and non-json content-type', async () => {
    expect.hasAssertions();

    mockedFetchResult.headers.set('content-type', 'application/something-or-other');
    mockedFetchResultJson = { hello: 'world!' };
    mockedFetchResult.ok = false;
    mockedFetchResult.status = 403;

    await expect(jsonFetch('some-url')).resolves.toStrictEqual({
      res: mockedFetchResult,
      json: undefined,
      error: {}
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
      globalJsonRequestOptions.rejectIfNotOk = false;

      await expect(jsonFetch('some-url', { rejectIfNotOk: true })).rejects.toThrow(
        'response status code 567 was not in the range 200-299'
      );

      // ? Should also reject with an HttpError even if JSON is not parsable
      mockedFetchResultJson = new SyntaxError(
        'unexpected token ? in JSON at position ??'
      );

      await expect(jsonFetch('some-url', { rejectIfNotOk: true })).rejects.toThrow(
        'response status code 567 was not in the range 200-299'
      );

      mockedFetchResultJson = 'unexpected token ?? in JSON at position ?';

      await expect(jsonFetch('some-url', { rejectIfNotOk: true })).rejects.toThrow(
        'response status code 567 was not in the range 200-299'
      );
    } finally {
      delete globalJsonRequestOptions.rejectIfNotOk;
    }
  });

  it('rejects if the response has a non-2xx status code, non-json content-type, or non-json body when both rejectIfNonJsonContentType and rejectIfNotOk are true', async () => {
    expect.hasAssertions();

    mockedFetchResult.headers.set('content-type', 'application/json');
    mockedFetchResultJson = { hello: 'world!' };
    mockedFetchResult.ok = false;
    mockedFetchResult.status = 404;

    await expect(
      jsonFetch('some-url', { rejectIfNotOk: true, rejectIfNonJsonContentType: true })
    ).rejects.toMatchObject({ res: mockedFetchResult, json: mockedFetchResultJson });

    mockedFetchResult.headers.set('content-type', 'application/something');
    mockedFetchResult.ok = true;
    mockedFetchResult.status = 200;

    await expect(
      jsonFetch('some-url', { rejectIfNotOk: true, rejectIfNonJsonContentType: true })
    ).rejects.toMatchObject({ res: mockedFetchResult, json: mockedFetchResultJson });

    mockedFetchResult.headers.set('content-type', 'application/json');
    mockedFetchResultJson = new SyntaxError(
      'unexpected token ? in JSON at position ??'
    );

    await expect(
      jsonFetch('some-url', { rejectIfNotOk: true, rejectIfNonJsonContentType: true })
    ).rejects.toMatchObject({ res: mockedFetchResult, json: undefined });

    mockedFetchResultJson = 'unexpected token ?? in JSON at position ?';

    await expect(
      jsonFetch('some-url', { rejectIfNotOk: true, rejectIfNonJsonContentType: true })
    ).rejects.toMatchObject({ res: mockedFetchResult, json: undefined });
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
    ).rejects.toThrow('failed to stringify request body:');

    const spy = jest
      .spyOn(JSON, 'stringify')
      .mockImplementation(() =>
        toss(new SyntaxError('unexpected token ? in JSON at position ??'))
      );

    await expect(
      jsonFetch('some-url', {
        // headers: { 'content-type': 'application/json' }, // ? Default
        body: 'whatever'
      })
    ).rejects.toThrow(
      'failed to stringify request body: unexpected token ? in JSON at position ??'
    );

    spy.mockImplementation(() => toss('unexpected token ?? in JSON at position ?'));

    await expect(
      jsonFetch('some-url', {
        // headers: { 'content-type': 'application/json' }, // ? Default
        body: 'whatever'
      })
    ).rejects.toThrow(
      'failed to stringify request body: unexpected token ?? in JSON at position ?'
    );
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

describe('::swrFetch', () => {
  it('returns the json response directly', async () => {
    expect.hasAssertions();

    mockedFetchResult.headers.set('content-type', 'application/json');
    mockedFetchResultJson = { hello: 'world!' };

    await expect(swrFetch()('some-x-url')).resolves.toBe(mockedFetchResultJson);
    expect(asMockedFunction(unfetch)).toBeCalledWith(
      'some-x-url',
      expect.objectContaining({ swr: true })
    );
  });

  it('sets the request method to GET even if it is set to POST globally (still locally overridable)', async () => {
    expect.hasAssertions();

    globalJsonRequestOptions.method = 'POST';

    try {
      mockedFetchResult.headers.set('content-type', 'application/json');
      mockedFetchResultJson = { hello: 'world!' };

      await expect(swrFetch()('some-x-url')).resolves.toBe(mockedFetchResultJson);
      expect(asMockedFunction(unfetch)).toBeCalledWith(
        'some-x-url',
        expect.objectContaining({ method: 'GET' })
      );

      await expect(swrFetch({ method: 'PUT' })('some-x-url')).resolves.toBe(
        mockedFetchResultJson
      );
      expect(asMockedFunction(unfetch)).toBeCalledWith(
        'some-x-url',
        expect.objectContaining({ method: 'PUT' })
      );
    } finally {
      delete globalJsonRequestOptions.method;
    }
  });

  it('rejects if the response has a non-2xx status code even if rejectIfNotOk is false', async () => {
    expect.hasAssertions();

    mockedFetchResult.headers.set('content-type', 'application/json');
    mockedFetchResult.ok = false;
    mockedFetchResult.status = 789;

    await expect(swrFetch({ rejectIfNotOk: false })('some-x-url')).rejects.toThrow(
      'response status code 789 was not in the range 200-299'
    );
  });

  it('rejects if the response has a non-json content-type even if rejectIfNonJsonContentType is false', async () => {
    expect.hasAssertions();

    mockedFetchResult.headers.set('content-type', 'application/bad');

    await expect(
      swrFetch({ rejectIfNonJsonContentType: false })('some-x-url')
    ).rejects.toThrow('application/bad');
  });
});
