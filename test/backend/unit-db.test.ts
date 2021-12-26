import { isolatedImportFactory, withMockedEnv } from 'testverse/setup';
import { Db, MongoClient, ObjectId } from 'mongodb';

import type { DbSchema } from 'universe/backend/db';

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

jest.mock('mongodb');

let mockDbSchema: DbSchema;
const mockMongoClient = MongoClient as jest.MockedClass<typeof MongoClient>;
const mockObjectId = ObjectId as jest.MockedClass<typeof ObjectId>;

const importDbLib = isolatedImportFactory<typeof import('universe/backend/db')>({
  path: 'universe/backend/db'
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

            constructor() {
              this.dropDatabase = jest.fn();
              this.createIndex = jest.fn();
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
            // eslint-disable-next-line jest/no-conditional-expect
            expect(db2.createCollection).toBeCalledWith(col, undefined);
          } else {
            // eslint-disable-next-line jest/no-conditional-expect
            expect(db2.createCollection).toBeCalledWith(col.name, col.createOptions);

            if (col.indices) {
              col.indices.forEach((spec) =>
                // eslint-disable-next-line jest/no-conditional-expect
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

describe('::itemExists', () => {
  it('returns true if an item exists in a collection where [key] == id', () => {
    expect.hasAssertions();
  });

  it('respects exclude_id option', async () => {
    expect.hasAssertions();
  });

  it('respects caseInsensitive option', async () => {
    expect.hasAssertions();
  });
});

describe('::itemToObjectId', () => {
  it('reduces an item down to its ObjectId instance', async () => {
    expect.hasAssertions();
  });

  it('reduces an array of items down to ObjectId instances', async () => {
    expect.hasAssertions();
  });
});

describe('::itemToStringId', () => {
  it('reduces an item down to its ObjectId string representation', async () => {
    expect.hasAssertions();
  });

  it('reduces an array of items down to ObjectId string representations', async () => {
    expect.hasAssertions();
  });
});

describe('::hydrateDb', () => {
  it('fills a database with dummy data', async () => {
    expect.hasAssertions();
  });

  it('throws if named database has no corresponding dummy data', async () => {
    expect.hasAssertions();
  });
});

describe('::setupTestDb', () => {
  it('sets up test version of databases via jest lifecycle hooks', async () => {
    expect.hasAssertions();
  });
});
