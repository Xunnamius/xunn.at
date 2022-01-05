import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { getClient } from 'multiverse/mongo-schema';

import type { TestCustomizations } from 'multiverse/mongo-test';

jest.mock('configverse/get-schema-config', () => mockedMongoCustomizations);
jest.mock('configverse/get-dummy-data', () => mockedMongoCustomizations);

const now = Date.now();

let mockedMongoCustomizations: TestCustomizations;

beforeEach(() => {
  mockedMongoCustomizations = mockedMongoCustomizations || {};

  mockedMongoCustomizations.getSchemaConfig = async () => {
    return {
      databases: {
        'db-1': {
          collections: ['col']
        },

        'db-2': {
          collections: [
            'col-1',
            { name: 'col-2', createOptions: { capped: true, size: 256 } },
            {
              name: 'col-3',
              indices: [
                { spec: ['key', -1], options: { unique: true } },
                { spec: 'item' }
              ]
            }
          ]
        }
      },
      aliases: {
        'alias-1': 'db-1',
        'alias-2': 'db-2'
      }
    };
  };

  mockedMongoCustomizations.getDummyData = async () => {
    return {
      'db-1': {
        _generatedAt: now,
        col: [{ item: 1 }, { item: 2 }, { item: 3 }]
      },
      'db-2': {
        _generatedAt: now,
        'col-1': [{ item: 'a' }, { item: 'b' }],
        'col-2': [{ item: 'c' }],
        'col-3': [{ key: 1, item: 'd' }]
      }
    };
  };
});

describe('[run using non-deferred setupMemoryServerOverride]', () => {
  setupMemoryServerOverride();

  it('setupMemoryServerOverride works', async () => {
    expect.hasAssertions();

    const client = await getClient();
    const db1 = client.db('db-1');
    const db2 = client.db('db-2');

    await expect(db1.listCollections().next()).resolves.toStrictEqual(
      expect.objectContaining({ name: 'col', options: {} })
    );

    await expect(db2.listCollections().toArray()).resolves.toIncludeAllPartialMembers([
      { name: 'col-1', options: {} },
      { name: 'col-2', options: { capped: true, size: 256 } },
      { name: 'col-3', options: {} }
    ]);

    await expect(
      db2.collection('col-3').listIndexes().toArray()
    ).resolves.toIncludeAllPartialMembers([
      { key: { _id: 1 } },
      { key: { key: 1 }, unique: true },
      { key: { item: 1 } }
    ]);

    await expect(
      db1.collection('col').find().toArray()
    ).resolves.toIncludeAllPartialMembers([{ item: 1 }, { item: 2 }, { item: 3 }]);

    await expect(
      db2.collection('col-1').find().toArray()
    ).resolves.toIncludeAllPartialMembers([{ item: 'a' }, { item: 'b' }]);

    await expect(
      db2.collection('col-2').find().toArray()
    ).resolves.toIncludeAllPartialMembers([{ item: 'c' }]);

    await expect(
      db2.collection('col-3').find().toArray()
    ).resolves.toIncludeAllPartialMembers([{ key: 1, item: 'd' }]);
  });
});
