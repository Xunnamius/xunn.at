import { MongoClient } from 'mongodb';
import { InvalidConfigurationError } from 'named-app-errors';
import { getEnv } from 'multiverse/next-env';
import { debugFactory } from 'multiverse/debug-extended';
import { findProjectRoot } from 'multiverse/find-project-root';

import type { Db } from 'mongodb';

// TODO: this package must be published transpiled to cjs by babel but NOT
// TODO: webpacked!

const debug = debugFactory('mongo-schema:db');
let memory: InternalMemory = getInitialInternalMemoryState();

type createIndexParams = Parameters<Db['createIndex']>;

/**
 * An internal cache of connection, server schema, and database state.
 */
export type InternalMemory = {
  schema: DbSchema | null;
  client: MongoClient | null;
  databases: Record<string, Db>;
};

/**
 * A configuration object representing a MongoDB collection.
 */
export type CollectionSchema = {
  name: string;
  createOptions?: Parameters<Db['createCollection']>[1];
  indices?: {
    spec: createIndexParams[1];
    options?: createIndexParams[2];
  }[];
};

/**
 * A configuration object representing a MongoDB database.
 */
export type DbSchema = {
  databases: Record<
    string,
    {
      collections: (string | CollectionSchema)[];
    }
  >;

  aliases: Record<string, string>;
};

/**
 * Returns a copy of the initial state of internal memory. Useful when
 * overwriting internal memory.
 */
export function getInitialInternalMemoryState(): InternalMemory {
  return {
    schema: null,
    client: null,
    databases: {}
  };
}

/**
 * Finds the file at `${projectRoot}/db`, `${projectRoot}/src/db`, or
 * `${projectRoot}/src/backend/db`, imports it, calls the `getSchemaConfig`
 * function defined within, and memoizes the result.
 */
export async function getSchemaConfig(): Promise<DbSchema> {
  if (memory.schema) {
    return memory.schema;
  } else {
    const root = findProjectRoot();
    const paths = [`${root}/db`, `${root}/src/db`, `${root}/src/backend/db`];
    let getCustomSchemaConfig: typeof getSchemaConfig | undefined;

    (
      await Promise.allSettled<{
        getSchemaConfig?: typeof getSchemaConfig;
      }>(paths.map((path) => import(path)))
    ).some((result, ndx) => {
      if (result.status == 'fulfilled') {
        getCustomSchemaConfig = result.value.getSchemaConfig;
      }

      if (getCustomSchemaConfig) {
        debug(`using schema config from path:`, paths[ndx]);
        return true;
      } else {
        debug.warn(`failed to import schema config from path:`, paths[ndx]);
        return false;
      }
    });

    if (!getCustomSchemaConfig) {
      throw new InvalidConfigurationError(
        `could not resolve mongodb schema. One of the following import paths must resolve to a file with an (optionally) async "getSchemaConfig" function that returns a DbSchema object:\n\n  - ${paths.join(
          '\n  - '
        )}`
      );
    }

    return (memory.schema = await getCustomSchemaConfig());
  }
}

/**
 * Mutates internal memory. Used for testing purposes.
 */
export function overwriteMemory(newMemory: InternalMemory) {
  memory = newMemory;
  debug('internal memory overwritten');
}

/**
 * Lazily connects to the server on-demand, memoizing the result.
 */
export async function getClient() {
  if (!memory.client) {
    const uri = getEnv().MONGODB_URI;
    debug(`connecting to mongo server at ${uri}`);
    memory.client = await MongoClient.connect(uri);
  } else {
    debug('connected (from memory) to mongo server');
  }

  return memory.client;
}

/**
 * Kills the MongoClient instance and any related database connections.
 */
export async function closeClient() {
  /* istanbul ignore else */
  if (memory?.client) {
    debug('closing server connection');
    await memory.client.close(true);
  }

  memory = getInitialInternalMemoryState();
}

/**
 * Accepts a database alias and returns its real name. If the actual database
 * is not listed in the schema, an error is thrown.
 */
export async function getNameFromAlias(alias: string) {
  const schema = await getSchemaConfig();
  const nameActual = schema.aliases[alias] || alias;

  if (alias != nameActual) {
    debug(`mapped alias "${alias}" to database name "${nameActual}"`);
  }

  if (!schema.databases[nameActual]?.collections) {
    throw new InvalidConfigurationError(
      `database "${nameActual}" is not defined in schema`
    );
  }

  return nameActual;
}

/**
 * Lazily connects to a database on-demand, memoizing the result. If the
 * database does not yet exist, it is created (but not initialized) by this
 * function.
 */
export async function getDb({
  name
}: {
  /**
   * The name or alias of the database to retrieve.
   */
  name: string;
}) {
  const nameActual = await getNameFromAlias(name);

  if (!memory.databases[nameActual]) {
    debug(`acquiring mongo database "${nameActual}"`);
    memory.databases[nameActual] = (await getClient()).db(nameActual);
  } else {
    debug(`acquired (from memory) mongo database "${nameActual}"`);
  }

  return memory.databases[nameActual];
}

/**
 * Drops a database, destroying its collections. If the database does not exist
 * before calling this function, it will be created first then dropped.
 */
export async function destroyDb({
  name
}: {
  /**
   * The name or alias of the database to destroy.
   */
  name: string;
}) {
  return (await getDb({ name })).dropDatabase();
}

/**
 * Creates a database and initializes its collections. If the database does not
 * exist before calling this function, it will be created first. Otherwise, this
 * function is idempotent.
 */
export async function initializeDb({
  name
}: {
  /**
   * The name or alias of the database to initialize.
   */
  name: string;
}) {
  const db = await getDb({ name });
  const nameActual = await getNameFromAlias(name);

  await Promise.all(
    (
      await getSchemaConfig()
    ).databases[nameActual].collections.map((colNameOrSchema) => {
      const colSchema: CollectionSchema =
        typeof colNameOrSchema == 'string'
          ? {
              name: colNameOrSchema
            }
          : colNameOrSchema;

      return db.createCollection(colSchema.name, colSchema.createOptions).then((col) => {
        return Promise.all(
          colSchema.indices?.map((indexSchema) =>
            col.createIndex(indexSchema.spec, indexSchema.options || {})
          ) || []
        );
      });
    })
  );
}
