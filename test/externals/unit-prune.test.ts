import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { getDb } from 'multiverse/mongo-schema';
import { dummyRootData, useMockDateNow } from 'multiverse/mongo-common';

import {
  mockEnvFactory,
  protectedImportFactory,
  withMockedOutput
} from 'testverse/setup';

import { TrialError } from 'named-app-errors';

// * Follow the steps (below) to tailor these tests to this specific project 😉

// ? Ensure the isolated external picks up the memory server override
jest.mock('multiverse/mongo-schema', () => {
  return jest.requireActual('multiverse/mongo-schema');
});

const testCollectionsMap = {
  'root.request-log': dummyRootData['request-log'].length,
  'root.limited-log': dummyRootData['limited-log'].length
  // * Step 1: Add new collections here w/ keys of the form: database.collection
};

const withMockedEnv = mockEnvFactory({
  NODE_ENV: 'test',
  PRUNE_DATA_MAX_LOGS: '200000',
  PRUNE_DATA_MAX_BANNED: '100000'
  // * Step 2: Add new env var default values here
});

const testCollections = Object.keys(testCollectionsMap);

const importPruneData = protectedImportFactory<
  typeof import('externals/prune-data').default
>({
  path: 'externals/prune-data',
  useDefault: true
});

setupMemoryServerOverride();
useMockDateNow();

/**
 * Accepts one or more database and collection names in the form
 * `database.collection` and returns their size.
 */
async function countCollection(collections: string): Promise<number>;
async function countCollection(
  collections: string[]
): Promise<Record<string, number>>;
async function countCollection(
  collections: string | string[]
): Promise<number | Record<string, number>> {
  const targetCollections = [collections].flat();
  const result = Object.assign(
    {},
    ...(await Promise.all(
      targetCollections.map(async (dbCollection) => {
        const [dbName, ...rawCollectionName] = dbCollection.split('.');

        if (!dbName || rawCollectionName.length != 1) {
          throw new TrialError(`invalid input "${dbCollection}" to countCollection`);
        }

        return (await getDb({ name: dbName }))
          .collection(rawCollectionName[0])
          .countDocuments()
          .then((count) => ({ [dbCollection]: count }));
      })
    ))
  );

  const resultLength = Object.keys(result).length;

  if (resultLength != targetCollections.length) {
    throw new TrialError('invalid output from countCollection');
  }

  return resultLength == 1 ? result[collections.toString()] : result;
}

it('becomes verbose when no DEBUG environment variable set and NODE_ENV is not test', async () => {
  expect.hasAssertions();

  await withMockedOutput(async ({ infoSpy }) => {
    await withMockedEnv(importPruneData, {
      DEBUG: undefined,
      NODE_ENV: 'something-else',
      OVERRIDE_EXPECT_ENV: 'force-no-check'
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

  // * Step 3: Add new env vars emptiness tests below

  // ? Remember that withMockedEnv is the result of calling a factory function
  // ? with all the PRUNE_DATA_MAX_X env vars already defined.

  await withMockedEnv(() => importPruneData({ expectedExitCode: 2 }), {
    PRUNE_DATA_MAX_LOGS: '',
    PRUNE_DATA_MAX_BANNED: ''
  });

  await withMockedEnv(() => importPruneData({ expectedExitCode: 2 }), {
    PRUNE_DATA_MAX_LOGS: ''
  });

  await withMockedEnv(() => importPruneData({ expectedExitCode: 2 }), {
    PRUNE_DATA_MAX_BANNED: ''
  });
});

it('ensures at most PRUNE_DATA_MAX_X entries exist', async () => {
  expect.hasAssertions();

  await expect(countCollection(testCollections)).resolves.toStrictEqual(
    testCollectionsMap
  );

  // * Step 4: Add new env vars low-prune-threshold tests below

  await withMockedEnv(importPruneData, {
    PRUNE_DATA_MAX_LOGS: '10',
    PRUNE_DATA_MAX_BANNED: '2'
  });

  await expect(countCollection(testCollections)).resolves.toStrictEqual({
    'root.request-log': 10,
    'root.limited-log': 2
  });

  await withMockedEnv(importPruneData, {
    PRUNE_DATA_MAX_LOGS: '1',
    PRUNE_DATA_MAX_BANNED: '1'
  });

  await expect(countCollection(testCollections)).resolves.toStrictEqual({
    'root.request-log': 1,
    'root.limited-log': 1
  });
});

it('only deletes entries if necessary', async () => {
  expect.hasAssertions();

  await expect(countCollection(testCollections)).resolves.toStrictEqual(
    testCollectionsMap
  );

  await withMockedEnv(importPruneData, {
    PRUNE_DATA_MAX_LOGS: '100',
    PRUNE_DATA_MAX_BANNED: '100'
    // * Step 5: Add new env vars high-prune-threshold values here
  });

  await expect(countCollection(testCollections)).resolves.toStrictEqual(
    testCollectionsMap
  );
});
