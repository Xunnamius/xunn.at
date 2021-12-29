import { MongoClient } from 'mongodb';
import { InvalidConfigurationError } from 'named-app-errors';
import { getEnv } from 'multiverse/next-env';
import { debugFactory } from 'multiverse/debug-extended';
import { findNextJSProjectRoot } from 'multiverse/next-project-root';

import type { Db } from 'mongodb';
import type { Promisable } from 'type-fest';

// TODO: this package must be published transpiled to cjs by babel but NOT
// TODO: webpacked!

const debug = debugFactory('mongo-schema:db');
let memory: InternalMemory | null = null;

type createIndexParams = Parameters<Db['createIndex']>;

/**
 * An internal cache of connection, server schema, and database state.
 */
export type InternalMemory = {
  schema: DbSchema;
  clientIsExternal: boolean;
  client: MongoClient;
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
 * Finds the file at `${nextProjectRoot}/src/db` or
 * `${nextProjectRoot}/src/backend/db`, imports it, calls the `getSchemaConfig`
 * function defined within, and memoizes the result.
 */
export async function getSchemaConfig(): Promise<DbSchema> {
  !memory && (memory = {} as InternalMemory);

  if (memory.schema) {
    return memory.schema;
  } else {
    const root = findNextJSProjectRoot();
    const paths = [`${root}/src/db`, `${root}/src/backend/db`];
    const { getSchemaConfig: importSchemaConfig } = (await import(paths[0])
      .catch(() => import(paths[1]))
      .catch(() => ({}))) as { getSchemaConfig?: () => Promisable<DbSchema> };

    if (!importSchemaConfig) {
      throw new InvalidConfigurationError(
        `could not resolve mongodb schema; one of the following import paths must resolve to a file with an (optionally) async "getSchemaConfig" function that returns a DbSchema object:\n\n  - ${paths[0]}\n\n  - ${paths[1]}`
      );
    }

    return (memory.schema = await importSchemaConfig());
  }
}

/**
 * Mutates internal memory. Used for testing purposes.
 */
export function overwriteMemory(newMemory: Partial<InternalMemory>) {
  memory = { clientIsExternal: false, ...memory, ...newMemory } as InternalMemory;
  debug('internal db memory overwritten');
}

/**
 * Lazily connects to the server on-demand, memoizing the result.
 */
export async function getClient(params?: {
  /**
   * If `true`, `EXTERNAL_SCRIPTS_MONGODB_URI` is checked first to determine
   * server uri. If `false`, `MONGODB_URI` is used; this is the default (and
   * fallback).
   *
   * Note that this function does not close any client or database connections
   * when switching between external and non-external URIs. If doing this, be
   * sure to close old client connections manually or risk memory leaks!
   */
  external?: boolean;
}) {
  !memory && (memory = {} as InternalMemory);

  if (!memory.client || !!memory.clientIsExternal != !!params?.external) {
    let uri = getEnv().MONGODB_URI;

    if (params?.external) {
      uri = getEnv().EXTERNAL_SCRIPTS_MONGODB_URI;
      memory.clientIsExternal = true;
    } else {
      memory.clientIsExternal = false;
    }

    debug(`connecting to ${params?.external ? 'external ' : ''}mongo server at ${uri}`);
    memory.client = await MongoClient.connect(uri);
  } else {
    debug('connected (from memory) to mongo server');
  }

  return memory.client;
}

/**
 * Kills the MongoClient and closes any lingering database connections.
 */
export async function closeClient() {
  debug('closing client');
  await memory?.client.close(true);
  memory = null;
}

/**
 * Accepts a database alias and returns its real name. If the actual database
 * is not listed in the schema, an error is thrown.
 */
export async function getNameFromAlias(alias: string) {
  const schema = await getSchemaConfig();
  const nameActual = schema.aliases[alias] || alias;

  debug(`alias: ${alias}`);
  debug(`actual name: ${nameActual}`);

  if (!schema.databases[nameActual]?.collections) {
    throw new InvalidConfigurationError(
      `database schema "${nameActual}" is not defined in backend/db.schema`
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
  name,
  external
}: {
  /**
   * The name or alias of the database to retrieve.
   */
  name: string;
  /**
   * If `true`, `EXTERNAL_SCRIPTS_MONGODB_URI` is checked first to determine
   * server uri. If `false`, `MONGODB_URI` is used; this is the default (and
   * fallback).
   */
  external?: boolean;
}) {
  !memory && (memory = {} as InternalMemory);

  if (!memory.databases) {
    memory.databases = {};
  } else if (!!memory.clientIsExternal != !!external) {
    for (const k in memory.databases) {
      delete memory.databases[k];
    }
  }

  const nameActual = await getNameFromAlias(name);

  if (!memory.databases[nameActual]) {
    debug(`connecting to mongo database "${nameActual}"`);
    memory.databases[nameActual] = (await getClient({ external })).db(nameActual);
  } else {
    debug(`connected (from memory) to mongo database "${nameActual}"`);
  }

  return memory.databases[nameActual];
}

/**
 * Drops a database, destroying its collections. If the database does not exist
 * before calling this function, it will be created first then dropped.
 */
export async function destroyDb({
  name,
  external
}: {
  /**
   * The name or alias of the database to destroy.
   */
  name: string;
  /**
   * If `true`, `EXTERNAL_SCRIPTS_MONGODB_URI` is checked first to determine
   * server uri. If `false`, `MONGODB_URI` is used; this is the default (and
   * fallback).
   */
  external?: boolean;
}) {
  return (await getDb({ name, external })).dropDatabase();
}

/**
 * Creates a database and initializes its collections. If the database does not
 * exist before calling this function, it will be created first. Otherwise, this
 * function is idempotent.
 */
export async function initializeDb({
  name,
  external
}: {
  /**
   * The name or alias of the database to initialize.
   */
  name: string;
  /**
   * If `true`, `EXTERNAL_SCRIPTS_MONGODB_URI` is checked first to determine
   * server uri. If `false`, `MONGODB_URI` is used; this is the default (and
   * fallback).
   */
  external?: boolean;
}) {
  const db = await getDb({ name, external });
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
