import { MongoClient } from 'mongodb';
import { getEnv } from 'multiverse/next-env';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { InvalidConfigurationError } from 'named-app-errors';
import { debugFactory } from 'multiverse/debug-extended';
import { findNextJSProjectRoot } from 'multiverse/next-project-root';

import {
  getSchemaConfig,
  overwriteMemory,
  getClient,
  getDb,
  getNameFromAlias,
  initializeDb,
  destroyDb,
  closeClient
} from 'multiverse/mongo-schema';

import type { Document } from 'mongodb';
import type { Promisable } from 'type-fest';

// TODO: this package must be published transpiled to cjs by babel but NOT
// TODO: webpacked!

const debug = debugFactory('mongo-test:test-db');

/**
 * Finds the file at `${nextProjectRoot}/test/db` or
 * `${nextProjectRoot}/test/backend/db`, imports it, and calls the
 * `getDummyData` function defined within.
 */
export async function getDummyData() {
  const root = findNextJSProjectRoot();
  const paths = [`${root}/test/db`, `${root}/test/backend/db`];
  const { getDummyData: importDummyData } = (await import(paths[0])
    .catch(() => import(paths[1]))
    .catch(() => ({}))) as { getDummyData?: () => Promisable<DummyData> };

  if (!importDummyData) {
    throw new InvalidConfigurationError(
      `could not resolve dummy data; one of the following import paths must resolve to a file with an (optionally) async "getDummyData" function that returns a DummyData object:\n\n  - ${paths[0]}\n\n  - ${paths[1]}`
    );
  }

  return importDummyData();
}

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
    _generatedAt: number;

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
  const nameActual = await getNameFromAlias(name);
  debug(`hydrating database ${nameActual}`);
  const dummyData = (await getDummyData())[nameActual];

  if (!dummyData) {
    throw new InvalidConfigurationError(
      `dummy data for database "${nameActual}" does not exist`
    );
  }

  const collectionNames = (await getSchemaConfig()).databases[nameActual].collections.map(
    (col) => (typeof col == 'string' ? col : col.name)
  );

  await Promise.all(
    Object.entries(dummyData).map(([colName, colSchema]) => {
      if (colName != '_generatedAt') {
        if (!collectionNames.includes(colName)) {
          throw new InvalidConfigurationError(
            `collection "${nameActual}.${colName}" referenced in dummy data is not defined in source db schema`
          );
        }

        return db.collection(colName).insertMany([colSchema].flat() as Document[]);
      }
    })
  );
}

/**
 * Setup a test version of the databases using jest lifecycle hooks.
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
    const databases = Object.keys((await getSchemaConfig()).databases);
    debug(`setting up mongo memory server on port ${port}`);
    await Promise.all(
      databases.map((name) =>
        destroyDb({ name })
          .then(() => initializeDb({ name }))
          .then(() => hydrateDb({ name }))
      )
    );
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
