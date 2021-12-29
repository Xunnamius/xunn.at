import { ObjectId } from 'mongodb';
import { toss } from 'toss-expression';
import { GuruMeditationError } from 'named-app-errors';

import type { Collection, WithId } from 'mongodb';

/**
 * Represents the value of the `_id` property of a MongoDB collection entry.
 * Optionally, a key other than `_id` can be specified using the `{ key: ...,
 * id: ... }` syntax.
 */
export type ItemExistsIdParam =
  | string
  | ObjectId
  | { key: string; id: string | ObjectId };

/**
 * Available options for the `itemExists` function.
 */
export type ItemExistsOptions = {
  excludeId?: ItemExistsIdParam;
  caseInsensitive?: boolean;
};

/**
 * Checks if an item matching `{ _id: id }` exists within `collection`.
 */
export async function itemExists<T>(
  collection: Collection<T>,
  id: string | ObjectId,
  options?: ItemExistsOptions
): Promise<boolean>;
/**
 * Checks if an item matching `{ [descriptor.key]: descriptor.id }` exists
 * within `collection`.
 */
export async function itemExists<T>(
  collection: Collection<T>,
  descriptor: { key: string; id: string | ObjectId },
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

/**
 * The shape of an object that can be translated into an `ObjectId` (or `T`)
 * instance or is `null`/`undefined`.
 */
export type IdItem<T extends ObjectId> = WithId<unknown> | string | T | null | undefined;

/**
 * The shape of an object that can be translated into an array of `ObjectId` (or
 * `T`) instances or is `null`/`undefined`.
 */
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
            : toss(new GuruMeditationError(`encountered irreducible sub-item: ${i}`))
        ) as T;
      })
    : typeof item == 'string'
    ? (new ObjectId(item) as T)
    : item
    ? (item._id as T)
    : toss(new GuruMeditationError(`encountered irreducible item: ${item}`));
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
