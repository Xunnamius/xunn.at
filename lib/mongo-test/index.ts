import { MongoClient } from 'mongodb';
import { getEnv } from 'multiverse/next-env';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { InvalidAppConfigurationError, TrialError } from 'named-app-errors';
import { debugFactory } from 'multiverse/debug-extended';
import inspector from 'inspector';

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
 * Imports `getDummyData` from "configverse/get-dummy-data" and calls it.
 */
export async function getDummyData(): Promise<DummyData> {
  try {
    debug('importing `getDummyData` from "configverse/get-dummy-data"');
    return await (await import('configverse/get-dummy-data')).getDummyData();
  } catch (e) {
    debug.warn(
      `failed to import getDummyData from "configverse/get-dummy-data": ${e}`
    );

    throw new InvalidAppConfigurationError(
      'could not resolve mongodb dummy data: failed to import getDummyData from "configverse/get-dummy-data". Did you forget to register "configverse/get-dummy-data" as an import alias/path?'
    );
  }
}

/**
 * Fill an initialized database with data. You should call {@link initializeDb}
 * before calling this function.
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
    throw new InvalidAppConfigurationError(
      `dummy data for database "${nameActual}" does not exist`
    );
  }

  const collectionNames = (await getSchemaConfig()).databases[
    nameActual
  ].collections.map((col) => (typeof col == 'string' ? col : col.name));

  await Promise.all(
    Object.entries(dummyData).map(([colName, colSchema]) => {
      if (colName != '_generatedAt') {
        if (!collectionNames.includes(colName)) {
          throw new InvalidAppConfigurationError(
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
  // ? If an error (like a bad schema config or misconfigured dummy dataset)
  // ? occurs at any point (e.g. in one of the hooks), the other hooks should
  // ? become noops. Without this, test database state may leak outside the test
  // ? environment. If an .env file is defined, test state could leak into a
  // ? real mongodb instance (super bad!!!)
  let errored = false;

  const port: number | undefined =
    // * https://stackoverflow.com/a/67445850/1367414
    ((getEnv().DEBUG_INSPECTING || inspector.url() !== undefined) &&
      getEnv().MONGODB_MS_PORT) ||
    undefined;

  debug(`using ${port ? `port ${port}` : 'random port'} for mongo memory server`);

  // * The in-memory server is not started until it's needed later on
  const server = new MongoMemoryServer({
    instance: {
      port
      // ? MongoDB errors WITHOUT this line as of version 4.x
      // ? However, MongoDB errors WITH this line as of version 5.x 🙃
      // args: ['--enableMajorityReadConcern=0']
    }
  });

  /**
   * Reset the dummy MongoDb server databases back to their initial states.
   */
  const reinitializeServer = async () => {
    try {
      if (errored) {
        debug.warn(
          'reinitialization was skipped due to a previous jest lifecycle errors'
        );
      } else {
        const databases = Object.keys((await getSchemaConfig()).databases);
        debug('reinitializing mongo databases');
        await Promise.all(
          databases.map((name) =>
            destroyDb({ name })
              .then(() => initializeDb({ name }))
              .then(() => hydrateDb({ name }))
          )
        );
      }
    } catch (e) {
      errored = true;
      debug.error('an error occurred during reinitialization');
      throw e;
    }
  };

  beforeAll(async () => {
    try {
      if (errored) {
        debug.warn(
          '"beforeAll" jest lifecycle hook was skipped due to previous errors'
        );
      } else {
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
      }
    } catch (e) {
      errored = true;
      debug.error('an error occurred within "beforeAll" lifecycle hook');
      throw e;
    }
  });

  if (!params?.defer) {
    beforeEach(reinitializeServer);
  }

  afterAll(async () => {
    await closeClient();
    await server.stop({ force: true });
  });

  return { reinitializeServer };
}
