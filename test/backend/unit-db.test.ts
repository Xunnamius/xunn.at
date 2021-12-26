import { isolatedImportFactory } from 'testverse/setup';
import { Db, MongoClient, ObjectId } from 'mongodb';

import type { DbSchema } from 'universe/backend/db';

jest.mock('universe/backend/db/schema', () => {
  mockedDbSchema = mockedDbSchema || {
    databases: {
      'fake-db': {
        collections: ['col']
      }
    },
    aliases: {
      'fake-alias': 'fake-db'
    }
  };
  return { schema: mockedDbSchema };
});

let mockedDbSchema: DbSchema;

const importDbLib = isolatedImportFactory<typeof import('universe/backend/db')>({
  path: 'universe/backend/db'
});

describe('::overwriteMemory', () => {
  it('replaces memory when called', async () => {
    expect.hasAssertions();

    const client = new (class {})() as MongoClient;
    const databases = { 'fake-db': new (class {})() as Db };
    const lib = importDbLib();

    lib.overwriteMemory({ client, databases });
    await expect(lib.getClient()).resolves.toBe(client);
    await expect(lib.getDb({ name: 'fake-db' })).resolves.toBe(databases['fake-db']);
  });
});

describe('::getClient', () => {
  it("creates client if it doesn't already exist", async () => {
    expect.hasAssertions();
  });

  it('respects the external parameter', async () => {
    expect.hasAssertions();
  });

  it('returns memoized client', async () => {
    expect.hasAssertions();
  });
});

describe('::getDb', () => {
  it("creates db if it doesn't already exist", async () => {
    expect.hasAssertions();
  });

  it('respects the external parameter', async () => {
    expect.hasAssertions();
  });

  it('returns memoized db', async () => {
    expect.hasAssertions();
  });
});

describe('::closeClient', () => {
  it('closes client and deletes memory', async () => {
    expect.hasAssertions();
  });
});

describe('::destroyDb', () => {
  it('drops database', async () => {
    expect.hasAssertions();
  });
});

describe('::initializeDb', () => {
  it("initializes a database's collections", async () => {
    expect.hasAssertions();
  });
});

describe('::getNameFromAlias', () => {
  it('returns an actual database name', async () => {
    expect.hasAssertions();
  });

  it('throws if database is not in schema', async () => {
    expect.hasAssertions();
  });
});

describe('::itemExists', () => {
  it('returns true if an item exists in a collection with a specific ObjectId at async id', () => {
    expect.hasAssertions();
  });

  it('respects exclude_id', async () => {
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
