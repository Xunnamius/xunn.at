import { MongoClient } from 'mongodb';
import { InvalidAppConfigurationError } from 'named-app-errors';
import { getEnv } from 'multiverse/next-env';
import { debugFactory } from 'multiverse/debug-extended';

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
  /**
   * Memoized resolved database schemas and aliases.
   */
  schema: DbSchema | null;
  /**
   * Memoized MongoDB driver client connection.
   */
  client: MongoClient | null;
  /**
   * Memoized MongoDB driver Database instances.
   */
  databases: Record<string, Db>;
};

/**
 * A configuration object representing a MongoDB collection.
 */
export type CollectionSchema = {
  /**
   * The valid MongoDB name of the collection.
   */
  name: string;
  /**
   * An object passed directly to the MongoDB `createCollection` function via
   * the `createOptions` parameter.
   */
  createOptions?: Parameters<Db['createCollection']>[1];
  /**
   * An object representing indices to be created on the MongoDB collection via
   * `createIndex`.
   */
  indices?: {
    spec: createIndexParams[1];
    options?: createIndexParams[2];
  }[];
};

/**
 * A configuration object representing one or more MongoDB databases and their
 * aliases.
 */
export type DbSchema = {
  databases: Record<
    string,
    {
      /**
       * An array of MongoDB collections.
       */
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
 * Imports `getSchemaConfig` from "configverse/get-schema-config", calls it, and
 * memoizes the result.
 */
export async function getSchemaConfig(): Promise<DbSchema> {
  if (memory.schema) {
    debug('returning schema configuration from memory');
    return memory.schema;
  } else {
    try {
      debug('importing `getSchemaConfig` from "configverse/get-schema-config"');
      return (memory.schema = await (
        await import('configverse/get-schema-config')
      ).getSchemaConfig());
    } catch (e) {
      debug.warn(
        `failed to import getSchemaConfig from "configverse/get-schema-config": ${e}`
      );

      throw new InvalidAppConfigurationError(
        'could not resolve mongodb schema configuration: failed to import getSchemaConfig from "configverse/get-schema-config". Did you forget to register "configverse/get-schema-config" as an import alias/path?'
      );
    }
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
 * Kills the MongoClient instance and any related database connections and
 * clears internal memory.
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
 * Accepts a database alias (or real name) and returns its real name. If the
 * actual database is not listed in the schema, an error is thrown.
 */
export async function getNameFromAlias(alias: string) {
  const schema = await getSchemaConfig();
  const nameActual = schema.aliases[alias] || alias;

  if (alias != nameActual) {
    debug(`mapped alias "${alias}" to database name "${nameActual}"`);
  }

  if (!schema.databases[nameActual]?.collections) {
    throw new InvalidAppConfigurationError(
      `database "${nameActual}" is not defined in schema`
    );
  }

  return nameActual;
}

/**
 * Lazily connects to a database on-demand, memoizing the result. If the
 * database does not yet exist, it is both created and initialized by this
 * function. The latter can be prevented by setting `initialize` to `false`.
 */
export async function getDb({
  name,
  initialize
}: {
  /**
   * The name or alias of the database to retrieve.
   */
  name: string;
  /**
   * Set to `false` to prevent `getDb` from calling `initializeDb` if the
   * database does not exist prior to acquiring it.
   *
   * @default true
   */
  initialize?: boolean;
}) {
  const nameActual = await getNameFromAlias(name);

  if (!memory.databases[nameActual]) {
    debug(`acquiring mongo database "${nameActual}"`);

    const client = await getClient();
    const existingDatabases = (
      await client.db('admin').admin().listDatabases()
    ).databases.map(({ name }) => name);

    memory.databases[nameActual] = client.db(nameActual);

    if (initialize !== false && !existingDatabases.includes(nameActual)) {
      debug(`calling initializeDb since "${nameActual}" was just created`);
      await initializeDb({ name: nameActual });
    }
  } else {
    debug(`acquired (from memory) mongo database "${nameActual}"`);
  }

  return memory.databases[nameActual];
}

/**
 * Drops a database, destroying its collections. If the database does not exist
 * before calling this function, it will be created first then dropped.
 *
 * Note that this function does not clear the destroyed database's Db instance
 * from internal memory for performance reasons.
 */
export async function destroyDb({
  name
}: {
  /**
   * The name or alias of the database to destroy.
   */
  name: string;
}) {
  const nameActual = await getNameFromAlias(name);
  debug(`destroying database "${nameActual}" and its collections`);
  return !memory.databases[nameActual] || (await getDb({ name })).dropDatabase();
}

/**
 * Creates a database and initializes its collections. If the database does not
 * exist before calling this function, it will be created first. This function
 * should only be called on empty or brand new databases **and not on databases
 * with pre-existing collections.**
 */
export async function initializeDb({
  name
}: {
  /**
   * The name or alias of the database to initialize.
   */
  name: string;
}) {
  const db = await getDb({ name, initialize: false });
  const nameActual = await getNameFromAlias(name);

  debug(`initializing database "${nameActual}"`);

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

      debug(`initializing collection "${nameActual}.${colSchema.name}"`);
      return db
        .createCollection(colSchema.name, colSchema.createOptions)
        .then((col) => {
          return Promise.all(
            colSchema.indices?.map((indexSchema) =>
              col.createIndex(indexSchema.spec, indexSchema.options || {})
            ) || []
          );
        });
    })
  );
}
