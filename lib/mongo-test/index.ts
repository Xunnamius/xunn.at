import { MongoClient } from 'mongodb';
import { getEnv } from 'multiverse/next-env';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { InvalidConfigurationError, TrialError } from 'named-app-errors';
import { debugFactory } from 'multiverse/debug-extended';
import { findProjectRoot } from 'multiverse/find-project-root';

import {
  getSchemaConfig,
  overwriteMemory,
  getDb,
  getNameFromAlias,
  initializeDb,
  destroyDb,
  closeClient,
  getInitialInternalMemoryState
} from 'multiverse/mongo-schema';

import type { Document } from 'mongodb';
import type { DbSchema } from 'multiverse/mongo-schema';

// TODO: this package must be published transpiled to cjs by babel but NOT
// TODO: webpacked!

const debug = debugFactory('mongo-test:test-db');
const memory = { dataPath: null } as { dataPath: string | null };

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
 * For use when mocking the contents of files containing `getDummyData` and/or
 * `getSchemaConfig`.
 */
export type TestCustomizations = {
  getDummyData: () => Promise<DummyData>;
  getSchemaConfig: () => Promise<DbSchema>;
};

/**
 * Finds the file at `${projectRoot}/db`, `${projectRoot}/test/db`, or
 * `${projectRoot}/test/backend/db`, imports it, and calls the `getDummyData`
 * function defined within.
 */
export async function getDummyData(): Promise<DummyData> {
  const root = findProjectRoot();
  const paths = [`${root}/db`, `${root}/test/db`, `${root}/test/backend/db`];
  let getCustomDummyData: typeof getDummyData | undefined;

  if (memory.dataPath) {
    debug(`using dummy data from memoized path: ${memory.dataPath}`);
    ({ getDummyData: getCustomDummyData } = await import(memory.dataPath));
  } else {
    (
      await Promise.allSettled<{
        getDummyData?: typeof getDummyData;
      }>(paths.map((path) => import(path)))
    ).some((result, ndx) => {
      if (result.status == 'fulfilled') {
        getCustomDummyData = result.value.getDummyData;
      }

      if (getCustomDummyData) {
        memory.dataPath = paths[ndx];
        debug(`using dummy data from path:`, memory.dataPath);
        return true;
      } else {
        debug.warn(`failed to import dummy data from path: ${paths[ndx]}`);
        return false;
      }
    });
  }

  if (!getCustomDummyData) {
    throw new InvalidConfigurationError(
      `could not resolve dummy data. One of the following import paths must resolve to a file with an (optionally) async "getDummyData" function that returns a DummyData object:\n\n  - ${paths.join(
        '\n  - '
      )}`
    );
  }

  return getCustomDummyData();
}

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
 * Setup per-test versions of the mongodb client and database connections using
 * jest lifecycle hooks.
 */
export function setupMemoryServerOverride(params?: {
  /**
   * If `true`, `beforeEach` and `afterEach` lifecycle hooks are skipped and the
   * database is initialized and hydrated once before all tests are run. **In
   * this mode, all tests will share the same database state!**
   *
   * @default false
   */
  defer?: boolean;
}) {
  const port = (getEnv().DEBUG_INSPECTING && getEnv().MONGODB_MS_PORT) || undefined;
  debug(`using ${port ? `port ${port}` : 'random port'} for mongo memory server`);

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
    debug('reinitializing mongo databases');
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
    const uri = server.getUri();
    debug(`connecting to in-memory dummy mongo server at ${uri}`);

    if (port && !(uri.endsWith(`:${port}/`) || uri.endsWith(`:${port}`))) {
      throw new TrialError(
        `unable to start mongodb memory server: port ${port} seems to be in use`
      );
    }

    overwriteMemory({
      ...getInitialInternalMemoryState(),
      client: await MongoClient.connect(uri)
    });

    if (params?.defer) await reinitializeServer();
  });

  if (!params?.defer) {
    beforeEach(reinitializeServer);
  }

  afterAll(async () => {
    await closeClient();
    await server.stop(true);
  });

  return { reinitializeServer };
}
