/* eslint-disable jest/no-conditional-expect */
import { isolatedImportFactory, withMockedEnv } from 'testverse/setup';
import { Db, MongoClient } from 'mongodb';
import { asMockedClass, asMockedFunction } from '@xunnamius/jest-types';

import type { DbSchema } from 'universe/backend/db';
import { DummyData } from 'testverse/db';

jest.mock('universe/backend/db/schema', () => {
  mockDbSchema = mockDbSchema || {
    databases: {
      'fake-db-1': {
        collections: ['col']
      },

      'fake-db-2': {
        collections: [
          'col-1',
          { name: 'col-2', createOptions: { capped: true } },
          { name: 'col-3', indices: [{ spec: 'some-key' }] },
          {
            name: 'col-4',
            indices: [{ spec: ['some-key', -1], options: { comment: '' } }]
          }
        ]
      }
    },
    aliases: {
      'fake-alias-1': 'fake-db-1',
      'fake-alias-2': 'fake-db-2'
    }
  };
  return { schema: mockDbSchema };
});

jest.mock('testverse/db.schema', () => {
  const now = Date.now();

  mockDummyDbData = mockDummyDbData || {
    'fake-db-1': {
      _generatedAt: now,
      col: [{ item: 1 }, { item: 2 }, { item: 3 }]
    },
    'fake-db-2': {
      _generatedAt: now,
      'col-1': [{ item: 'a' }, { item: 'b' }],
      'col-does-not-exist': [{ fake: true }]
    }
  };

  return { getDummyData: () => mockDummyDbData };
});

jest.mock('mongodb');

let mockDbSchema: DbSchema;
let mockDummyDbData: DummyData;
const mockMongoClient = asMockedClass(MongoClient);

const importDbLib = isolatedImportFactory<typeof import('universe/backend/db')>({
  path: 'universe/backend/db'
});

const importTestDbLib = isolatedImportFactory<typeof import('testverse/db')>({
  path: 'testverse/db'
});

beforeEach(() => {
  mockMongoClient.connect = jest.fn((url: string) =>
    Promise.resolve(
      new (class {
        url = url;

        db(name: string) {
          return new (class {
            parentUrl = url;
            databaseName = name;
            dropDatabase;
            createCollection;
            createIndex;
            collection;

            constructor() {
              this.dropDatabase = jest.fn();
              this.createIndex = jest.fn();
              // ? Reuse this.createIndex method for easy access to mock
              this.collection = jest.fn(() => ({ insertMany: this.createIndex }));
              this.createCollection = jest.fn(() =>
                Promise.resolve({ createIndex: this.createIndex })
              );
            }
          })();
        }

        close() {
          return url;
        }
      })() as unknown as MongoClient
    )
  );
});

describe('::getClient', () => {
  it("creates client if it doesn't already exist", async () => {
    expect.hasAssertions();

    const lib = importDbLib();

    await withMockedEnv(
      async () => {
        const client = await lib.getClient();
        await expect(lib.getClient()).resolves.toBe(client);
        expect(mockMongoClient.connect).toHaveBeenCalledTimes(1);
        expect(client.close()).toBe('abc');
      },
      { MONGODB_URI: 'abc', EXTERNAL_SCRIPTS_MONGODB_URI: '123' },
      { replace: false }
    );
  });

  it('respects the external parameter', async () => {
    expect.hasAssertions();

    const lib = importDbLib();

    await withMockedEnv(
      async () => {
        const client = await lib.getClient({ external: true });
        await expect(lib.getClient({ external: true })).resolves.toBe(client);
        await expect(lib.getClient()).resolves.not.toBe(client);
        expect(mockMongoClient.connect).toHaveBeenCalledTimes(2);
        expect(client.close()).toBe('123');
      },
      { MONGODB_URI: 'abc', EXTERNAL_SCRIPTS_MONGODB_URI: '123' },
      { replace: false }
    );
  });
});

describe('::getDb', () => {
  it("creates db and connection if it doesn't already exist", async () => {
    expect.hasAssertions();

    const lib = importDbLib();

    await withMockedEnv(
      async () => {
        expect(mockMongoClient.connect).toHaveBeenCalledTimes(0);
        const db = await lib.getDb({ name: 'fake-db-1' });
        await expect(lib.getDb({ name: 'fake-db-1' })).resolves.toBe(db);
        expect(mockMongoClient.connect).toHaveBeenCalledTimes(1);
        await expect(lib.getDb({ name: 'fake-db-2' })).resolves.not.toBe(db);
        expect(mockMongoClient.connect).toHaveBeenCalledTimes(1);
        expect(db.databaseName).toBe('fake-db-1');
      },
      { MONGODB_URI: 'abc', EXTERNAL_SCRIPTS_MONGODB_URI: '123' },
      { replace: false }
    );
  });

  it('respects the external parameter', async () => {
    expect.hasAssertions();

    const lib = importDbLib();

    await withMockedEnv(
      async () => {
        expect(mockMongoClient.connect).toHaveBeenCalledTimes(0);
        const db = await lib.getDb({ name: 'fake-db-1', external: true });
        await expect(lib.getDb({ name: 'fake-db-1', external: true })).resolves.toBe(db);
        expect(mockMongoClient.connect).toHaveBeenCalledTimes(1);
        await expect(lib.getDb({ name: 'fake-db-1' })).resolves.not.toBe(db);
        expect(mockMongoClient.connect).toHaveBeenCalledTimes(2);
        expect(db.databaseName).toBe('fake-db-1');
      },
      { MONGODB_URI: 'abc', EXTERNAL_SCRIPTS_MONGODB_URI: '123' },
      { replace: false }
    );
  });

  it('returns db using alias', async () => {
    expect.hasAssertions();

    const lib = importDbLib();

    await withMockedEnv(
      async () => {
        const db1 = await lib.getDb({ name: 'fake-db-1', external: true });
        await expect(lib.getDb({ name: 'fake-alias-1', external: true })).resolves.toBe(
          db1
        );

        const db2 = await lib.getDb({ name: 'fake-alias-2' });
        await expect(lib.getDb({ name: 'fake-db-2' })).resolves.toBe(db2);
      },
      { MONGODB_URI: 'abc', EXTERNAL_SCRIPTS_MONGODB_URI: '123' },
      { replace: false }
    );
  });
});

describe('::overwriteMemory', () => {
  it('replaces memory when called', async () => {
    expect.hasAssertions();

    const client = new (class {})() as MongoClient;
    const databases = { 'fake-db-1': new (class {})() as Db };
    const lib = importDbLib();

    lib.overwriteMemory({ client, databases });
    await expect(lib.getClient()).resolves.toBe(client);
    await expect(lib.getDb({ name: 'fake-db-1' })).resolves.toBe(databases['fake-db-1']);
  });
});

describe('::closeClient', () => {
  it('closes client and deletes memory', async () => {
    expect.hasAssertions();

    const lib = importDbLib();

    await withMockedEnv(
      async () => {
        const client = await lib.getClient();
        await expect(lib.getClient()).resolves.toBe(client);
        await lib.closeClient();
        await expect(lib.getClient()).resolves.not.toBe(client);
      },
      { MONGODB_URI: 'abc', EXTERNAL_SCRIPTS_MONGODB_URI: '123' },
      { replace: false }
    );
  });
});

describe('::destroyDb', () => {
  it('drops database', async () => {
    expect.hasAssertions();

    const lib = importDbLib();

    await withMockedEnv(
      async () => {
        const db = await lib.getDb({ name: 'fake-db-1' });
        expect(db.dropDatabase).toHaveBeenCalledTimes(0);
        await lib.destroyDb({ name: 'fake-db-2' });
        expect(db.dropDatabase).toHaveBeenCalledTimes(0);
        await lib.destroyDb({ name: 'fake-db-1' });
        expect(db.dropDatabase).toHaveBeenCalledTimes(1);
      },
      { MONGODB_URI: 'abc', EXTERNAL_SCRIPTS_MONGODB_URI: '123' },
      { replace: false }
    );
  });
});

describe('::getNameFromAlias', () => {
  it('returns an actual database name', async () => {
    expect.hasAssertions();
    expect(importDbLib().getNameFromAlias('fake-alias-2')).toBe('fake-db-2');
  });

  it('throws if database is not in schema', async () => {
    expect.hasAssertions();
    expect(() => importDbLib().getNameFromAlias('fake-alias-3')).toThrow(
      'schema "fake-alias-3" is not defined'
    );
  });
});

describe('::initializeDb', () => {
  it("initializes a database's collections according to schema", async () => {
    expect.hasAssertions();

    const lib = importDbLib();

    await withMockedEnv(
      async () => {
        const db1 = await lib.getDb({ name: 'fake-db-1' });
        const db2 = await lib.getDb({ name: 'fake-db-2' });

        await lib.initializeDb({ name: 'fake-db-1' });
        await lib.initializeDb({ name: 'fake-db-2' });

        mockDbSchema.databases['fake-db-1'].collections.forEach((col) => {
          expect(db1.createCollection).toBeCalledWith(
            ...(typeof col == 'string' ? [col, undefined] : [col.name, col.createOptions])
          );
        });

        mockDbSchema.databases['fake-db-2'].collections.forEach((col) => {
          if (typeof col == 'string') {
            expect(db2.createCollection).toBeCalledWith(col, undefined);
          } else {
            expect(db2.createCollection).toBeCalledWith(col.name, col.createOptions);

            if (col.indices) {
              col.indices.forEach((spec) =>
                expect(db2.createIndex).toBeCalledWith(spec.spec, spec.options || {})
              );
            }
          }
        });
      },
      { MONGODB_URI: 'abc', EXTERNAL_SCRIPTS_MONGODB_URI: '123' },
      { replace: false }
    );
  });
});

describe('::hydrateDb', () => {
  let oldMockDummyDbData: typeof mockDummyDbData;

  beforeEach(() => {
    oldMockDummyDbData = mockDummyDbData;
  });

  afterEach(() => {
    mockDummyDbData = oldMockDummyDbData;
    jest.dontMock('universe/backend/db');
  });

  it('fills a database with dummy data', async () => {
    expect.hasAssertions();

    const lib = importDbLib();
    jest.doMock('universe/backend/db', () => lib);
    const testLib = importTestDbLib();
    const db = await lib.getDb({ name: 'fake-db-1' });

    await expect(testLib.hydrateDb({ name: 'fake-db-1' })).toResolve();

    Object.entries(mockDummyDbData['fake-db-1']).forEach(([colName, colData]) => {
      if (colName != '_generatedAt') {
        expect(db.collection).toBeCalledWith(colName);
        // ? The createIndex method is reused for easy access to the target mock
        expect(db.createIndex).toBeCalledWith(colData);
      }
    });

    // eslint-disable-next-line jest/unbound-method
    asMockedFunction(db.collection).mockClear();
    // eslint-disable-next-line jest/unbound-method
    asMockedFunction(db.createIndex).mockClear();

    mockDummyDbData = {
      'fake-db-1': {
        _generatedAt: 0,
        col: { item: 'single', name: 'just-the-one' }
      }
    };

    await expect(testLib.hydrateDb({ name: 'fake-db-1' })).toResolve();
    expect(db.collection).toBeCalledWith('col');
    // ? The createIndex method is reused for easy access to the target mock
    expect(db.createIndex).toBeCalledWith([mockDummyDbData['fake-db-1'].col]);
  });

  it('throws if database in schema has no corresponding dummy data', async () => {
    expect.hasAssertions();

    const lib = importDbLib();
    jest.doMock('universe/backend/db', () => lib);
    const testLib = importTestDbLib();

    mockDummyDbData = {
      'fake-db-1': {
        _generatedAt: 0,
        col: { item: 'single', name: 'just-the-one' }
      }
    };

    await expect(testLib.hydrateDb({ name: 'fake-db-2' })).rejects.toThrow(
      /dummy data for database "fake-db-2" does not exist/
    );
  });

  it('throws if collection referenced in dummy data is not in schema', async () => {
    expect.hasAssertions();

    const lib = importDbLib();
    jest.doMock('universe/backend/db', () => lib);
    const testLib = importTestDbLib();

    await expect(testLib.hydrateDb({ name: 'fake-db-2' })).rejects.toThrow(
      /collection "fake-db-2.col-does-not-exist" referenced in dummy data is not defined in source db schema/
    );
  });
});
