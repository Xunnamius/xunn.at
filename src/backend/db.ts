import { name as pkgName } from 'package';
import { MongoClient, Db, ObjectId, Collection, WithId } from 'mongodb';
import { GuruMeditationError } from 'named-app-errors';
import { toss } from 'toss-expression';
import { getEnv } from 'universe/backend/env';
import debugFactory from 'debug';

import type { Nullish } from '@ergodark/types';

const debug = debugFactory(`${pkgName}:jest-setup`);

type InternalMemory = { client: MongoClient; db: Db } | null;
let memory: InternalMemory = null;

/**
 * Lazily connects to the database once on-demand instead of immediately when
 * the app runs.
 */
export async function getDb(params?: { external: true }) {
  if (!memory) {
    memory = {} as NonNullable<InternalMemory>;

    let uri = getEnv().MONGODB_URI;
    if (params?.external) uri = getEnv().EXTERNAL_SCRIPTS_MONGODB_URI;

    debug(`connecting to mongo database at ${uri}`);

    memory.client = await MongoClient.connect(uri);
    memory.db = memory.client.db();
  }

  return memory.db;
}

/**
 * Returns the MongoClient instance used to connect to the database.
 *
 * @param params if `{external: true}`, external Mongo connect URI will be used
 */
export async function getDbClient(params?: { external: true }) {
  await getDb(params);
  if (!memory) throw new GuruMeditationError('memory is missing');
  return memory.client;
}

/**
 * Kills the MongoClient and closes any lingering database connections.
 */
export async function closeDb() {
  await memory?.client.close(true);
  memory = null;
}

/**
 * Sets the global db instance to something else. Used primarily for testing
 * purposes.
 */
export function setClientAndDb({ client, db }: { client: MongoClient; db: Db }) {
  memory = memory ?? ({} as NonNullable<InternalMemory>);
  memory.client = client;
  memory.db = db;
}

/**
 * Destroys all collections in the database. Can be called multiple times
 * safely. Used primarily for testing purposes.
 */
export async function destroyDb(db: Db) {
  await Promise.allSettled([
    db.dropCollection('keys'),
    db.dropCollection('request-log'),
    db.dropCollection('limited-log-mview'),
    db.dropCollection('memes'),
    db.dropCollection('users'),
    db.dropCollection('info'),
    db.dropCollection('uploads')
  ]);
}

/**
 * Initializes the database collections and indices. This function is idempotent
 * and can be called without worry of data loss.
 */
export async function initializeDb(db: Db) {
  await Promise.all([
    db.createCollection('keys'),
    db.createCollection('request-log'),
    db.createCollection('limited-log-mview'),
    db.createCollection('memes'),
    // ? Collation allows for case-insensitive searching. See:
    // ? https://stackoverflow.com/a/40914924/1367414
    db.createCollection('users', { collation: { locale: 'en', strength: 2 } }),
    db.createCollection('info'),
    db.createCollection('uploads')
  ]);

  // TODO:
  // await Promise.all([
  //   memes.createIndex({ x: 1 }),
  //   memes.createIndex({ y: 1 }),
  //   memes.createIndex({ z: 1 })
  // ]);
}

// TODO: XXX: turn this into a package of some sort (and abstract away key type)
type ItemExistsOptions = { exclude_id?: ObjectId; caseInsensitive?: boolean };
/**
 * Checks if an item identified by some `key` (default identifier is `"_id"`)
 * exists within `collection`.
 */
export async function itemExists<T>(
  collection: Collection<T>,
  id: ObjectId,
  key?: '_id' | 'owner' | 'receiver' | 'replyTo',
  options?: ItemExistsOptions
): Promise<boolean>;
export async function itemExists<T>(
  collection: Collection<T>,
  id: string,
  key: string,
  options?: ItemExistsOptions
): Promise<boolean>;
export async function itemExists<T>(
  collection: Collection<T>,
  id: ObjectId | string,
  key = '_id',
  options?: ItemExistsOptions
): Promise<boolean> {
  if (options?.exclude_id) {
    if (!(options.exclude_id instanceof ObjectId)) {
      throw new GuruMeditationError('expected exclude_id option to be of type ObjectId');
    } else if (key == '_id') {
      throw new GuruMeditationError('cannot use exclude_id option with key == "_id"');
    }
  }

  if (key == '_id' && options?.exclude_id) {
    throw new GuruMeditationError(
      'assert failed: cannot use "_id" as key and use exclude_id simultaneously'
    );
  }

  const result = collection.find({
    [key]: id,
    ...(options?.exclude_id ? { _id: { $ne: options.exclude_id } } : {})
  } as unknown as Parameters<typeof collection.find>[0]);

  if (options?.caseInsensitive) {
    result.collation({ locale: 'en', strength: 2 });
  }

  return (await result.count()) != 0;
}

export type IdItem<T extends ObjectId> = WithId<unknown> | string | T | Nullish;
export type IdItemArray<T extends ObjectId> =
  | WithId<unknown>[]
  | string[]
  | T[]
  | Nullish;

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
            : toss(new GuruMeditationError('encountered untransformable sub-item'))
        ) as T;
      })
    : typeof item == 'string'
    ? (new ObjectId(item) as T)
    : item
    ? (item._id as T)
    : toss(
        new GuruMeditationError(`no transform for item "${item}" (type "${typeof item}")`)
      );
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
