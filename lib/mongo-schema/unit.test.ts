/* eslint-disable jest/no-conditional-expect */
import { isolatedImportFactory, mockEnvFactory } from 'testverse/setup';
import { Db, MongoClient } from 'mongodb';
import { asMockedClass, asMockedFunction } from '@xunnamius/jest-types';
import { findProjectRoot } from 'multiverse/find-project-root';

import type { TestCustomizations } from 'multiverse/mongo-test';
import { getInitialInternalMemoryState } from 'multiverse/mongo-schema';

jest.mock('mongodb');
jest.mock('multiverse/find-project-root');
jest.mock(`${__dirname}/db`, () => mockedMongoCustomizations, { virtual: true });

const withMockedEnv = mockEnvFactory({ NODE_ENV: 'test' });

const mockMongoClient = asMockedClass(MongoClient);
const mockFindProjectRoot = asMockedFunction(findProjectRoot);
let mockedMongoCustomizations: TestCustomizations;

const importDbLib = isolatedImportFactory<typeof import('multiverse/mongo-schema')>({
  path: 'multiverse/mongo-schema'
});

beforeEach(() => {
  mockFindProjectRoot.mockImplementation(() => __dirname);
  mockedMongoCustomizations = mockedMongoCustomizations || {};

  mockedMongoCustomizations.getSchemaConfig = async () => {
    return {
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
  };

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

describe('::getSchemaConfig', () => {
  it('dynamically imports customizations', async () => {
    expect.hasAssertions();

    await expect(importDbLib().getSchemaConfig()).resolves.toStrictEqual(
      await mockedMongoCustomizations.getSchemaConfig()
    );
  });

  it('falls back to alternative paths when original path fails', async () => {
    expect.hasAssertions();

    const mockGetSchemaConfig = jest.fn(mockedMongoCustomizations.getSchemaConfig);
    const schemaConfig = await mockedMongoCustomizations.getSchemaConfig();

    // @ts-expect-error: don't care that we're deleting a non-optional prop
    delete mockedMongoCustomizations.getSchemaConfig;

    jest.doMock(
      `${__dirname}/src/backend/db`,
      () => ({ getSchemaConfig: mockGetSchemaConfig }),
      { virtual: true }
    );

    expect(mockGetSchemaConfig).toBeCalledTimes(0);

    await expect(importDbLib().getSchemaConfig()).resolves.toStrictEqual(schemaConfig);

    expect(mockGetSchemaConfig).toBeCalledTimes(1);

    jest.dontMock(`${__dirname}/src/backend/db`);
    jest.doMock(`${__dirname}/src/db`, () => ({ getSchemaConfig: mockGetSchemaConfig }), {
      virtual: true
    });

    await expect(importDbLib().getSchemaConfig()).resolves.toStrictEqual(schemaConfig);

    expect(mockGetSchemaConfig).toBeCalledTimes(2);

    jest.dontMock(`${__dirname}/src/db`);
  });

  it('uses given path exclusively if provided', async () => {
    expect.hasAssertions();

    await expect(importDbLib().getSchemaConfig()).resolves.toStrictEqual(
      await mockedMongoCustomizations.getSchemaConfig()
    );

    // @ts-expect-error: don't care that we're deleting a non-optional prop
    delete mockedMongoCustomizations.getSchemaConfig;
    await expect(importDbLib().getSchemaConfig()).rejects.toThrow(
      `\n\n  - ${__dirname}/db\n  - ${__dirname}/src/db\n  - ${__dirname}/src/backend/db`
    );
  });

  it('rejects if customizations are unavailable', async () => {
    expect.hasAssertions();

    // @ts-expect-error: don't care that we're deleting a non-optional prop
    delete mockedMongoCustomizations.getSchemaConfig;
    await expect(importDbLib().getSchemaConfig()).rejects.toThrow(
      `\n\n  - ${__dirname}/db\n  - ${__dirname}/src/db\n  - ${__dirname}/src/backend/db`
    );
  });
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
      { MONGODB_URI: 'abc' }
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
      { MONGODB_URI: 'abc' }
    );
  });

  it('returns db using alias', async () => {
    expect.hasAssertions();

    const lib = importDbLib();

    await withMockedEnv(
      async () => {
        const db1 = await lib.getDb({ name: 'fake-db-1' });
        await expect(lib.getDb({ name: 'fake-alias-1' })).resolves.toBe(db1);

        const db2 = await lib.getDb({ name: 'fake-alias-2' });
        await expect(lib.getDb({ name: 'fake-db-2' })).resolves.toBe(db2);
      },
      { MONGODB_URI: 'abc' }
    );
  });
});

describe('::overwriteMemory', () => {
  it('replaces memory when called', async () => {
    expect.hasAssertions();

    const client = new (class {})() as MongoClient;
    const databases = { 'fake-db-1': new (class {})() as Db };
    const lib = importDbLib();

    lib.overwriteMemory({ ...getInitialInternalMemoryState(), client, databases });

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
      { MONGODB_URI: 'abc' }
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
      { MONGODB_URI: 'abc' }
    );
  });
});

describe('::getNameFromAlias', () => {
  it('returns an actual database name', async () => {
    expect.hasAssertions();
    await expect(importDbLib().getNameFromAlias('fake-alias-2')).resolves.toBe(
      'fake-db-2'
    );
  });

  it('throws if database is not in schema', async () => {
    expect.hasAssertions();
    await expect(importDbLib().getNameFromAlias('fake-alias-3')).rejects.toThrow(
      'database "fake-alias-3" is not defined'
    );
  });
});

describe('::initializeDb', () => {
  it("initializes a database's collections according to schema", async () => {
    expect.hasAssertions();

    const lib = importDbLib();

    await withMockedEnv(
      async () => {
        const schema = await lib.getSchemaConfig();
        const db1 = await lib.getDb({ name: 'fake-db-1' });
        const db2 = await lib.getDb({ name: 'fake-db-2' });

        await lib.initializeDb({ name: 'fake-db-1' });
        await lib.initializeDb({ name: 'fake-db-2' });

        schema.databases['fake-db-1'].collections.forEach((col) => {
          expect(db1.createCollection).toBeCalledWith(
            ...(typeof col == 'string' ? [col, undefined] : [col.name, col.createOptions])
          );
        });

        schema.databases['fake-db-2'].collections.forEach((col) => {
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
      { MONGODB_URI: 'abc' }
    );
  });
});
