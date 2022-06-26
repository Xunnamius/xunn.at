/* eslint-disable jest/no-conditional-expect */
import { asMockedFunction, asMockedClass } from '@xunnamius/jest-types';
import { isolatedImportFactory, mockEnvFactory } from 'testverse/setup';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

import type { TestCustomizations } from 'multiverse/mongo-test';
import { DummyError } from 'named-app-errors';
import { toss } from 'toss-expression';

jest.mock('mongodb');
jest.mock('mongodb-memory-server');

jest.mock('multiverse/mongo-schema', () => {
  if (mockedMongoSchema) {
    return mockedMongoSchema;
  } else {
    return jest.requireActual('multiverse/mongo-schema');
  }
});

jest.mock('configverse/get-schema-config', () => mockedMongoCustomizations);
jest.mock('configverse/get-dummy-data', () => mockedMongoCustomizations);

const now = Date.now();
const withMockedEnv = mockEnvFactory({ NODE_ENV: 'test' });

type MongoSchemaPackage = typeof import('multiverse/mongo-schema');

let mockedMongoSchema: MongoSchemaPackage | undefined;
let mockedMongoCustomizations: TestCustomizations;

const mockMongoClient = asMockedClass(MongoClient);
const mockMongoMemoryServer = asMockedClass(MongoMemoryServer);

const mockedMongoMemoryServer = {
  ensureInstance: jest.fn(),
  getUri: jest.fn(),
  stop: jest.fn()
} as unknown as MongoMemoryServer;

const importDbLib = isolatedImportFactory<MongoSchemaPackage>({
  path: 'multiverse/mongo-schema'
});

const importTestDbLib = isolatedImportFactory<typeof import('multiverse/mongo-test')>({
  path: 'multiverse/mongo-test'
});

beforeEach(() => {
  mockedMongoSchema = undefined;
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

  mockedMongoCustomizations.getDummyData = async () => {
    return {
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
  };

  mockMongoClient.connect = jest.fn(async (url: string) => {
    return new (class {
      url = url;

      db(name: string) {
        return new (class {
          parentUrl = url;
          databaseName = name;
          dropDatabase;
          createCollection;
          createIndex;
          collection;
          admin;

          constructor() {
            this.dropDatabase = jest.fn();
            this.createIndex = jest.fn();
            // ? Reuse this.createIndex method for easy access to mock
            this.collection = jest.fn(() => ({ insertMany: this.createIndex }));
            this.createCollection = jest.fn(() =>
              Promise.resolve({ createIndex: this.createIndex })
            );
            this.admin = jest.fn(() => ({
              listDatabases: jest.fn(() => ({
                databases: [
                  { name: 'auth' },
                  { name: 'request-log' },
                  { name: 'limited-log' }
                ]
              }))
            }));
          }
        })();
      }

      close() {
        return url;
      }
    })() as unknown as MongoClient;
  });

  mockMongoMemoryServer.mockImplementation(() => mockedMongoMemoryServer);
});

describe('::getDummyData', () => {
  it('dynamically imports customizations', async () => {
    expect.hasAssertions();

    await expect(importTestDbLib().getDummyData()).resolves.toStrictEqual(
      await mockedMongoCustomizations.getDummyData()
    );
  });

  it('rejects if customizations are unavailable', async () => {
    expect.hasAssertions();

    // @ts-expect-error: don't care that we're deleting a non-optional prop
    delete mockedMongoCustomizations.getDummyData;
    await expect(importTestDbLib().getDummyData()).rejects.toThrow(
      'configverse/get-dummy-data'
    );
  });
});

describe('::hydrateDb', () => {
  it('fills a database with dummy data (multi-item collections)', async () => {
    expect.hasAssertions();

    const lib = importDbLib();
    mockedMongoSchema = lib;
    const testLib = importTestDbLib();
    const db = await lib.getDb({ name: 'fake-db-1' });

    await expect(testLib.hydrateDb({ name: 'fake-db-1' })).resolves.toBeUndefined();

    Object.entries((await testLib.getDummyData())['fake-db-1']).forEach(
      ([colName, colData]) => {
        if (colName != '_generatedAt') {
          expect(db.collection).toBeCalledWith(colName);
          // ? The createIndex method is reused for easy access to the insertMany mock
          expect(db.createIndex).toBeCalledWith(colData);
        }
      }
    );
  });

  it('handles collections made up of a single item', async () => {
    expect.hasAssertions();

    mockedMongoCustomizations.getSchemaConfig = async () => {
      return {
        databases: {
          'fake-db-1': {
            collections: ['col']
          }
        },
        aliases: {}
      };
    };

    mockedMongoCustomizations.getDummyData = async () => {
      return {
        'fake-db-1': {
          _generatedAt: 0,
          col: { item: 'single', name: 'just-the-one' }
        }
      };
    };

    const lib = importDbLib();
    mockedMongoSchema = lib;
    const testLib = importTestDbLib();
    const db = await lib.getDb({ name: 'fake-db-1' });

    await expect(testLib.hydrateDb({ name: 'fake-db-1' })).resolves.toBeUndefined();

    expect(db.collection).toBeCalledWith('col');
    // ? The createIndex method is reused for easy access to the insertMany mock
    expect(db.createIndex).toBeCalledWith([
      (await testLib.getDummyData())['fake-db-1'].col
    ]);
  });

  it('throws if database in schema has no corresponding dummy data', async () => {
    expect.hasAssertions();

    mockedMongoCustomizations.getSchemaConfig = async () => {
      return {
        databases: {
          'fake-db-2': {
            collections: ['col']
          }
        },
        aliases: {}
      };
    };

    mockedMongoCustomizations.getDummyData = async () => {
      return {
        'fake-db-1': {
          _generatedAt: 0,
          col: { item: 'single', name: 'just-the-one' }
        }
      };
    };

    const lib = importDbLib();
    mockedMongoSchema = lib;
    const testLib = importTestDbLib();

    await expect(testLib.hydrateDb({ name: 'fake-db-2' })).rejects.toThrow(
      /dummy data for database "fake-db-2" does not exist/
    );
  });

  it('throws if collection referenced in dummy data is not in schema', async () => {
    expect.hasAssertions();

    const lib = importDbLib();
    mockedMongoSchema = lib;
    const testLib = importTestDbLib();

    await expect(testLib.hydrateDb({ name: 'fake-db-2' })).rejects.toThrow(
      /collection "fake-db-2.col-does-not-exist" referenced in dummy data is not defined in source db schema/
    );
  });
});

describe('::setupMemoryServerOverride', () => {
  it('registers jest hooks with respect to defer', async () => {
    expect.hasAssertions();

    const oldBeforeAll = beforeAll;
    const oldBeforeEach = beforeEach;
    const oldAfterAll = afterAll;

    try {
      const testLib = importTestDbLib();

      // eslint-disable-next-line no-global-assign
      beforeAll = jest.fn();
      // eslint-disable-next-line no-global-assign
      beforeEach = jest.fn();
      // eslint-disable-next-line no-global-assign
      afterAll = jest.fn();

      testLib.setupMemoryServerOverride();

      expect(beforeAll).toBeCalledTimes(1);
      expect(beforeEach).toBeCalledTimes(1);
      expect(afterAll).toBeCalledTimes(1);

      testLib.setupMemoryServerOverride({ defer: true });

      expect(beforeAll).toBeCalledTimes(2);
      expect(beforeEach).toBeCalledTimes(1);
      expect(afterAll).toBeCalledTimes(2);
    } finally {
      // eslint-disable-next-line no-global-assign
      beforeAll = oldBeforeAll;
      // eslint-disable-next-line no-global-assign
      beforeEach = oldBeforeEach;
      // eslint-disable-next-line no-global-assign
      afterAll = oldAfterAll;
    }
  });

  it('non-deferred hooks run', async () => {
    expect.hasAssertions();

    const oldBeforeAll = beforeAll;
    const oldBeforeEach = beforeEach;
    const oldAfterAll = afterAll;

    try {
      await withMockedEnv(async () => {
        const lib = importDbLib();

        mockedMongoSchema = lib;

        const testLib = importTestDbLib();

        const destroySpy = jest
          .spyOn(lib, 'destroyDb')
          .mockImplementation(async () => true);

        const initializeDbSpy = jest
          .spyOn(lib, 'initializeDb')
          .mockImplementation(async () => undefined);

        const hydrateDbSpy = jest
          .spyOn(testLib, 'hydrateDb')
          .mockImplementation(async () => undefined);

        const closeClientSpy = jest
          .spyOn(lib, 'closeClient')
          .mockImplementation(async () => undefined);

        // eslint-disable-next-line no-global-assign
        beforeAll = jest.fn();
        // eslint-disable-next-line no-global-assign
        beforeEach = jest.fn();
        // eslint-disable-next-line no-global-assign
        afterAll = jest.fn();

        testLib.setupMemoryServerOverride();

        expect(beforeAll).toBeCalledTimes(1);
        expect(beforeEach).toBeCalledTimes(1);
        expect(afterAll).toBeCalledTimes(1);

        await asMockedFunction(beforeAll).mock.calls[0][0](
          undefined as unknown as jest.DoneCallback
        );

        expect(destroySpy).not.toBeCalled();
        expect(initializeDbSpy).not.toBeCalled();
        expect(hydrateDbSpy).not.toBeCalled();
        expect(closeClientSpy).not.toBeCalled();
        // eslint-disable-next-line jest/unbound-method
        expect(asMockedFunction(mockedMongoMemoryServer.stop)).not.toBeCalled();

        await asMockedFunction(afterAll).mock.calls[0][0](
          undefined as unknown as jest.DoneCallback
        );

        expect(closeClientSpy).toBeCalled();
        // eslint-disable-next-line jest/unbound-method
        expect(asMockedFunction(mockedMongoMemoryServer.stop)).toBeCalled();

        testLib.setupMemoryServerOverride({ defer: true });

        expect(beforeAll).toBeCalledTimes(2);
        expect(beforeEach).toBeCalledTimes(1);
        expect(afterAll).toBeCalledTimes(2);

        await asMockedFunction(beforeAll).mock.calls[1][0](
          undefined as unknown as jest.DoneCallback
        );

        Object.keys((await mockedMongoCustomizations.getSchemaConfig()).databases).map(
          (name) => {
            expect(destroySpy).toBeCalledWith({ name });
            expect(initializeDbSpy).toBeCalledWith({ name });
            expect(hydrateDbSpy).toBeCalledWith({ name });
          }
        );

        await asMockedFunction(afterAll).mock.calls[1][0](
          undefined as unknown as jest.DoneCallback
        );

        expect(closeClientSpy).toBeCalledTimes(2);
        // eslint-disable-next-line jest/unbound-method
        expect(asMockedFunction(mockedMongoMemoryServer.stop)).toBeCalledTimes(2);
      });
    } finally {
      // eslint-disable-next-line no-global-assign
      beforeAll = oldBeforeAll;
      // eslint-disable-next-line no-global-assign
      beforeEach = oldBeforeEach;
      // eslint-disable-next-line no-global-assign
      afterAll = oldAfterAll;
    }
  });

  it('uses the debug port when inspecting', async () => {
    expect.hasAssertions();

    const oldBeforeAll = beforeAll;
    const oldBeforeEach = beforeEach;
    const oldAfterAll = afterAll;

    try {
      const testLib = importTestDbLib();

      // eslint-disable-next-line no-global-assign
      beforeAll = jest.fn();
      // eslint-disable-next-line no-global-assign
      beforeEach = jest.fn();
      // eslint-disable-next-line no-global-assign
      afterAll = jest.fn();

      await withMockedEnv(
        async () => {
          testLib.setupMemoryServerOverride();
          expect(mockMongoMemoryServer).toBeCalledWith({
            instance: expect.objectContaining({ port: 5678 })
          });
        },
        {
          VSCODE_INSPECTOR_OPTIONS: 'exists',
          MONGODB_MS_PORT: '5678'
        }
      );
    } finally {
      // eslint-disable-next-line no-global-assign
      beforeAll = oldBeforeAll;
      // eslint-disable-next-line no-global-assign
      beforeEach = oldBeforeEach;
      // eslint-disable-next-line no-global-assign
      afterAll = oldAfterAll;
    }
  });

  it('hook rejects if port does not match uri (EADDRINUSE)', async () => {
    expect.hasAssertions();

    const oldBeforeAll = beforeAll;
    const oldBeforeEach = beforeEach;
    const oldAfterAll = afterAll;

    try {
      const testLib = importTestDbLib();

      // eslint-disable-next-line no-global-assign
      beforeAll = jest.fn();
      // eslint-disable-next-line no-global-assign
      beforeEach = jest.fn();
      // eslint-disable-next-line no-global-assign
      afterAll = jest.fn();

      // eslint-disable-next-line jest/unbound-method
      asMockedFunction(mockedMongoMemoryServer.getUri).mockImplementationOnce(
        () => 'uri-not-ending-in-colon-5678'
      );

      await withMockedEnv(
        async () => {
          testLib.setupMemoryServerOverride();

          await expect(
            asMockedFunction(beforeAll).mock.calls[0][0](
              undefined as unknown as jest.DoneCallback
            )
          ).rejects.toThrow('port 5678 seems to be in use');
        },
        {
          VSCODE_INSPECTOR_OPTIONS: 'exists',
          MONGODB_MS_PORT: '5678'
        }
      );
    } finally {
      // eslint-disable-next-line no-global-assign
      beforeAll = oldBeforeAll;
      // eslint-disable-next-line no-global-assign
      beforeEach = oldBeforeEach;
      // eslint-disable-next-line no-global-assign
      afterAll = oldAfterAll;
    }
  });

  it('any rejection turns lifecycle hooks into noops', async () => {
    expect.hasAssertions();

    const oldBeforeAll = beforeAll;
    const oldBeforeEach = beforeEach;
    const oldAfterAll = afterAll;

    try {
      const lib = importDbLib();

      mockedMongoSchema = lib;

      const testLib = importTestDbLib();

      const destroySpy = jest
        .spyOn(lib, 'destroyDb')
        .mockImplementation(async () => true);

      // eslint-disable-next-line no-global-assign
      beforeAll = jest.fn();
      // eslint-disable-next-line no-global-assign
      beforeEach = jest.fn();
      // eslint-disable-next-line no-global-assign
      afterAll = jest.fn();

      // eslint-disable-next-line jest/unbound-method
      asMockedFunction(mockedMongoMemoryServer.getUri).mockImplementationOnce(
        () => 'uri-not-ending-in-colon-5678'
      );

      await withMockedEnv(
        async () => {
          testLib.setupMemoryServerOverride();

          await expect(
            asMockedFunction(beforeAll).mock.calls[0][0](
              undefined as unknown as jest.DoneCallback
            )
          ).rejects.toThrow('port 5678 seems to be in use');

          // ? Calling it a second time turns it into a noop
          await expect(
            asMockedFunction(beforeAll).mock.calls[0][0](
              undefined as unknown as jest.DoneCallback
            )
          ).resolves.toBeUndefined();

          // ? Other hooks are also noops
          await expect(
            asMockedFunction(beforeEach).mock.calls[0][0](
              undefined as unknown as jest.DoneCallback
            )
          ).resolves.toBeUndefined();

          expect(destroySpy).not.toBeCalled();
        },
        {
          VSCODE_INSPECTOR_OPTIONS: 'exists',
          MONGODB_MS_PORT: '5678'
        }
      );

      asMockedFunction(beforeAll).mockReset();
      asMockedFunction(beforeEach).mockReset();
      asMockedFunction(afterAll).mockReset();
      jest.spyOn(lib, 'getSchemaConfig').mockImplementation(() => toss(new DummyError()));

      testLib.setupMemoryServerOverride();

      await expect(
        asMockedFunction(beforeEach).mock.calls[0][0](
          undefined as unknown as jest.DoneCallback
        )
      ).rejects.toThrowError(DummyError);

      // ? Calling it a second time turns it into a noop
      await expect(
        asMockedFunction(beforeEach).mock.calls[0][0](
          undefined as unknown as jest.DoneCallback
        )
      ).resolves.toBeUndefined();
    } finally {
      // eslint-disable-next-line no-global-assign
      beforeAll = oldBeforeAll;
      // eslint-disable-next-line no-global-assign
      beforeEach = oldBeforeEach;
      // eslint-disable-next-line no-global-assign
      afterAll = oldAfterAll;
    }
  });
});
