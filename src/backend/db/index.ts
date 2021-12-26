import { debugNamespace } from 'universe/constants';
import { MongoClient, ObjectId } from 'mongodb';
import { toss } from 'toss-expression';
import { GuruMeditationError, InvalidConfigurationError } from 'universe/error';
import { getEnv } from 'universe/backend/env';
import { schema } from 'universe/backend/db/schema';
import { debugFactory } from 'multiverse/debug-extended';

import type { Db, Collection, WithId } from 'mongodb';

const debug = debugFactory(`${debugNamespace}:db`);
let memory: InternalMemory | null = null;

type createIndexParams = Parameters<Db['createIndex']>;

export type InternalMemory = {
  clientIsExternal: boolean;
  client: MongoClient;
  databases: Record<string, Db>;
};

export type CollectionSchema = {
  name: string;
  createOptions?: Parameters<Db['createCollection']>[1];
  indices?: {
    spec: createIndexParams[1];
    options?: createIndexParams[2];
  }[];
};

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
export function getNameFromAlias(alias: string) {
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

  const nameActual = getNameFromAlias(name);

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
  const nameActual = getNameFromAlias(name);

  await Promise.all(
    schema.databases[nameActual].collections.map((colNameOrSchema) => {
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

// TODO: XXX: turn this into a package of some sort
type ItemExistsIdParam = string | ObjectId | { key: string; id: string | ObjectId };
type ItemExistsOptions = { excludeId?: ItemExistsIdParam; caseInsensitive?: boolean };
/**
 * Checks if an item identified by some `key` (default identifier is `"_id"`)
 * exists within `collection`.
 */
export async function itemExists<T>(
  collection: Collection<T>,
  id: string | ObjectId,
  options?: ItemExistsOptions
): Promise<boolean>;
export async function itemExists<T>(
  collection: Collection<T>,
  id: { key: string; id: string | ObjectId },
  options?: ItemExistsOptions
): Promise<boolean>;
export async function itemExists<T>(
  collection: Collection<T>,
  id: ItemExistsIdParam,
  options?: ItemExistsOptions
): Promise<boolean> {
  let excludeIdProperty: string | null = null;
  let excludeId: string | ObjectId | null = null;
  const idProperty = typeof id == 'string' || id instanceof ObjectId ? '_id' : id.key;
  id = typeof id == 'string' || id instanceof ObjectId ? id : id.id;

  if (options?.excludeId) {
    excludeIdProperty =
      typeof options.excludeId == 'string' || options.excludeId instanceof ObjectId
        ? '_id'
        : options.excludeId.key;

    excludeId =
      typeof options.excludeId == 'string' || options.excludeId instanceof ObjectId
        ? options.excludeId
        : options.excludeId.id;
  }

  if (idProperty == excludeIdProperty) {
    throw new GuruMeditationError(
      `cannot lookup an item by property "${idProperty}" while also filtering results by that same property`
    );
  }

  const result = collection.find({
    [idProperty]: id,
    ...(excludeIdProperty ? { [excludeIdProperty]: { $ne: excludeId } } : {})
  } as unknown as Parameters<typeof collection.find>[0]);

  if (options?.caseInsensitive) {
    result.collation({ locale: 'en', strength: 2 });
  }

  return (await result.count()) != 0;
}

export type IdItem<T extends ObjectId> = WithId<unknown> | string | T | null | undefined;
export type IdItemArray<T extends ObjectId> =
  | WithId<unknown>[]
  | string[]
  | T[]
  | null
  | undefined;

/**
 * Reduces an `item` down to its `ObjectId` instance.
 */
export function itemToObjectId<T extends ObjectId>(item: IdItem<T>): T;
/**
 * Reduces an array of `item`s down to its `ObjectId` instances.
 */
export function itemToObjectId<T extends ObjectId>(item: IdItemArray<T>): T[];
export function itemToObjectId<T extends ObjectId>(
  item: IdItem<T> | IdItemArray<T>
): T | T[] {
  return item instanceof ObjectId
    ? item
    : Array.isArray(item)
    ? item.map((i: unknown) => {
        return (
          i instanceof ObjectId
            ? i
            : typeof i == 'string'
            ? new ObjectId(i)
            : i
            ? (i as WithId<unknown>)._id
            : toss(new GuruMeditationError(`encountered untransformable sub-item: ${i}`))
        ) as T;
      })
    : typeof item == 'string'
    ? (new ObjectId(item) as T)
    : item
    ? (item._id as T)
    : toss(new GuruMeditationError(`encountered untransformable item: ${item}`));
}

/**
 * Reduces an `item` down to the string representation of its `ObjectId`
 * instance.
 */
export function itemToStringId<T extends ObjectId>(item: IdItem<T>): string;
/**
 * Reduces an array of `item`s down to the string representations of their
 * respective `ObjectId` instances.
 */
export function itemToStringId<T extends ObjectId>(item: IdItemArray<T>): string[];
export function itemToStringId<T extends ObjectId>(
  item: IdItem<T> | IdItemArray<T>
): string | string[] {
  return Array.isArray(item)
    ? itemToObjectId<T>(item).map((i) => i.toString())
    : itemToObjectId<T>(item).toString();
}
