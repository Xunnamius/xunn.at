import { dummyRootData, setupTestDb } from 'testverse/db';
import pruneData from 'externals/prune-data';

import type { InternalRequestLogEntry } from 'types/global';
import type { WithId } from 'mongodb';
import { withMockedEnv } from '../setup';

const testCollections = ['request-log', 'limited-log'];

const { getDb } = setupTestDb();

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

describe('external-scripts/prune-data', () => {
  it('ensures at most PRUNE_DATA_MAX_X entries exist', async () => {
    expect.hasAssertions();

    await expect(countCollection(testCollections)).resolves.toStrictEqual({
      'request-log': dummyRootData['request-log'].length,
      'limited-log': dummyRootData['limited-log'].length
    });

    await withMockedEnv(
      async () => {
        await pruneData();
        await expect(countCollection(testCollections)).resolves.toStrictEqual({
          'request-log': 10,
          'limited-log': 2
        });
      },
      {
        PRUNE_DATA_MAX_LOGS: '10',
        PRUNE_DATA_MAX_BANNED: '2'
      },
      { replace: false }
    );

    await withMockedEnv(
      async () => {
        await pruneData();
        await expect(countCollection(testCollections)).resolves.toStrictEqual({
          'request-log': 1,
          'limited-log': 1
        });
      },
      {
        PRUNE_DATA_MAX_LOGS: '1',
        PRUNE_DATA_MAX_BANNED: '1'
      },
      { replace: false }
    );
  });

  it('only deletes entries if necessary', async () => {
    expect.hasAssertions();

    await expect(countCollection(testCollections)).resolves.toStrictEqual({
      'request-log': dummyRootData['request-log'].length,
      'limited-log': dummyRootData['limited-log'].length
    });

    await withMockedEnv(
      async () => {
        await pruneData();
        await expect(countCollection(testCollections)).resolves.toStrictEqual({
          'request-log': dummyRootData['request-log'].length,
          'limited-log': dummyRootData['limited-log'].length
        });
      },
      {
        PRUNE_DATA_MAX_LOGS: '100',
        PRUNE_DATA_MAX_BANNED: '100'
      },
      { replace: false }
    );
  });
});
