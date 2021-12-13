import { name as pkgName } from 'package';
import { MongoClient } from 'mongodb';
import { getEnv } from 'universe/backend/env';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { schema } from 'universe/backend/db/schema';
import { getDummyData } from 'testverse/db.schema';
import { InvalidConfigurationError } from 'universe/error';
import debugFactory from 'debug';

import {
  overwriteMemory,
  getClient,
  getDb,
  getNameFromAlias,
  initializeDb,
  destroyDb,
  closeClient
} from 'universe/backend/db';

import type { Document } from 'mongodb';

const debug = debugFactory(`${pkgName}:test-db`);

export * from 'testverse/db.schema';

/**
 * Generic dummy data used to hydrate databases and their collections.
 */
export type DummyData = {
  /**
   * The data inserted into each collection in the named database.
   */
  [databaseName: string]: {
    /**
     * Timestamp of when this dummy data was generated (in ms since unix epoch).
     */
    generatedAt: number;

    /**
     * The objects (if array) or object (if non-array) inserted into the
     * named collection.
     */
    [collectionName: string]: unknown;
  };
};

/**
 * Fill an initialized database with data. You should call `initializeDb` before
 * calling this function.
 */
export async function hydrateDb({
  name
}: {
  /**
   * The name or alias of the database to hydrate.
   */
  name: string;
}) {
  const db = await getDb({ name });
  const nameActual = getNameFromAlias(name);
  debug(`hydrating database ${nameActual}`);
  const dummyData = getDummyData()[nameActual];

  if (!dummyData) {
    throw new InvalidConfigurationError(
      `database schema "${nameActual}" is not defined in test/db.schema`
    );
  }

  const collectionNames = schema.databases[nameActual].collections.map((col) =>
    typeof col == 'string' ? col : col.name
  );

  await Promise.all(
    Object.entries(dummyData).map(([colName, colSchema]) => {
      if (colName != 'generatedAt') {
        if (!collectionNames.includes(colName)) {
          throw new InvalidConfigurationError(
            `collection "${nameActual}.${colName}" referenced in test/db.schema is not defined in backend/db.schema`
          );
        }

        return db.collection(colName).insertMany([colSchema].flat() as Document[]);
      }
    })
  );
}

/**
 * Setup a test version of the database using jest lifecycle hooks.
 *
 * @param defer If `true`, `beforeEach` and `afterEach` lifecycle hooks are
 * skipped and the database is initialized and hydrated once before all tests
 * are run. **In this mode, all tests will share the same database state!**
 */
export function setupTestDb(defer = false) {
  const port = (getEnv().DEBUG_INSPECTING && getEnv().MONGODB_MS_PORT) || undefined;

  // * The in-memory server is not started until it's needed later on
  const server = new MongoMemoryServer({
    instance: {
      port,
      // ? Latest mongo versions error without this line
      args: ['--enableMajorityReadConcern=0']
    }
  });

  /**
   * Reset the dummy MongoDb server databases back to their initial states.
   */
  const reinitializeServer = async () => {
    const databases = Object.keys(schema.databases);
    debug(`setting up mongo memory server on port ${port}`);
    await Promise.all(databases.map((name) => destroyDb({ name })));
    await Promise.all(databases.map((name) => initializeDb({ name })));
    await Promise.all(databases.map((name) => hydrateDb({ name })));
  };

  beforeAll(async () => {
    await server.ensureInstance();
    const uri = await server.getUri(); // ? Ensure singleton
    debug(`connecting to mongo memory server at ${uri}`);
    overwriteMemory({ client: await MongoClient.connect(uri) });
    if (defer) await reinitializeServer();
  });

  if (!defer) {
    beforeEach(reinitializeServer);
  }

  afterAll(async () => {
    await closeClient();
    await server.stop();
  });

  return {
    getClient,
    getDb,
    initializeDb,
    destroyDb,
    hydrateDb,
    reinitializeServer
  };
}
