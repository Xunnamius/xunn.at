import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { getDb } from 'multiverse/mongo-schema';
import { dummyRootData, useMockDateNow } from 'multiverse/mongo-common';

import {
  mockEnvFactory,
  protectedImportFactory,
  withMockedOutput
} from 'testverse/setup';

import type { InternalRequestLogEntry } from 'multiverse/next-log';
import type { WithId } from 'mongodb';

// ? Ensure the isolated external picks up the memory server override
jest.mock('multiverse/mongo-schema', () => {
  return jest.requireActual('multiverse/mongo-schema');
});

const testCollections = ['request-log', 'limited-log'];

const withMockedEnv = mockEnvFactory({
  NODE_ENV: 'test',
  PRUNE_DATA_MAX_LOGS: '200000',
  PRUNE_DATA_MAX_BANNED: '100000'
});

const importPruneData = protectedImportFactory<
  typeof import('externals/prune-data').default
>({
  path: 'externals/prune-data',
  useDefault: true
});

setupMemoryServerOverride();
useMockDateNow();

const countCollection = async (collections: string | string[]) => {
  const result = Object.assign(
    {},
    ...(await Promise.all(
      [collections].flat().map((collection) =>
        getDb({ name: 'root' }).then((db) =>
          db
            .collection<WithId<InternalRequestLogEntry>>(collection)
            .countDocuments()
            .then((count) => ({ [collection]: count }))
        )
      )
    ))
  );

  return Object.keys(result).length == 1
    ? (result[collections.toString()] as number)
    : (result as Record<string, number>);
};

it('becomes verbose when no DEBUG environment variable and NODE_ENV is not test', async () => {
  expect.hasAssertions();

  await withMockedOutput(async ({ infoSpy }) => {
    await withMockedEnv(importPruneData, {
      DEBUG: undefined,
      NODE_ENV: 'something-else',
      MONGODB_URI: 'some-uri',
      RESULTS_PER_PAGE: '5',
      MAX_CONTENT_LENGTH_BYTES: '100kb'
    });

    expect(infoSpy).toBeCalledWith(expect.stringContaining('execution complete'));
  });

  await withMockedOutput(async ({ infoSpy }) => {
    await withMockedEnv(importPruneData);
    expect(infoSpy).not.toBeCalled();
  });
});

it('rejects on bad environment', async () => {
  expect.hasAssertions();

  await withMockedEnv(() => importPruneData({ expectedExitCode: 2 }), {
    PRUNE_DATA_MAX_LOGS: ''
  });

  await withMockedEnv(() => importPruneData({ expectedExitCode: 2 }), {
    PRUNE_DATA_MAX_BANNED: ''
  });
});

it('ensures at most PRUNE_DATA_MAX_X entries exist', async () => {
  expect.hasAssertions();

  await expect(countCollection(testCollections)).resolves.toStrictEqual({
    'request-log': dummyRootData['request-log'].length,
    'limited-log': dummyRootData['limited-log'].length
  });

  await withMockedEnv(importPruneData, {
    PRUNE_DATA_MAX_LOGS: '10',
    PRUNE_DATA_MAX_BANNED: '2'
  });

  await expect(countCollection(testCollections)).resolves.toStrictEqual({
    'request-log': 10,
    'limited-log': 2
  });

  await withMockedEnv(importPruneData, {
    PRUNE_DATA_MAX_LOGS: '1',
    PRUNE_DATA_MAX_BANNED: '1'
  });

  await expect(countCollection(testCollections)).resolves.toStrictEqual({
    'request-log': 1,
    'limited-log': 1
  });
});

it('only deletes entries if necessary', async () => {
  expect.hasAssertions();

  await expect(countCollection(testCollections)).resolves.toStrictEqual({
    'request-log': dummyRootData['request-log'].length,
    'limited-log': dummyRootData['limited-log'].length
  });

  await withMockedEnv(importPruneData, {
    PRUNE_DATA_MAX_LOGS: '100',
    PRUNE_DATA_MAX_BANNED: '100'
  });

  await expect(countCollection(testCollections)).resolves.toStrictEqual({
    'request-log': dummyRootData['request-log'].length,
    'limited-log': dummyRootData['limited-log'].length
  });
});
