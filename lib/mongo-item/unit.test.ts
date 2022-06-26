import { ObjectId } from 'mongodb';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { itemExists, itemToObjectId, itemToStringId } from 'multiverse/mongo-item';
import { getDb } from 'multiverse/mongo-schema';
import { toss } from 'toss-expression';
import { TrialError } from 'named-app-errors';
import { DUMMY_BEARER_TOKEN, NULL_BEARER_TOKEN } from 'multiverse/next-auth';

import type { InternalAuthBearerEntry } from 'multiverse/next-auth';

setupMemoryServerOverride();

describe('::itemExists', () => {
  it('returns true if an item exists in a collection where [key] == id', async () => {
    expect.hasAssertions();

    const col = (await getDb({ name: 'root' })).collection('auth');
    const item =
      (await col.findOne<InternalAuthBearerEntry>()) ||
      toss(new TrialError('assert failed'));

    await expect(itemExists(col, item._id)).resolves.toBeTrue();
    await expect(itemExists(col, new ObjectId())).resolves.toBeFalse();

    await expect(
      itemExists(col, { key: 'token.bearer', id: DUMMY_BEARER_TOKEN })
    ).resolves.toBeTrue();

    await expect(
      itemExists(col, { key: 'token.bearer', id: NULL_BEARER_TOKEN })
    ).resolves.toBeFalse();
  });

  it('optimistically coerces strings to ObjectIds unless optimisticCoercion is false', async () => {
    expect.hasAssertions();

    const col = (await getDb({ name: 'root' })).collection('auth');
    const item =
      (await col.findOne<InternalAuthBearerEntry>()) ||
      toss(new TrialError('assert failed'));

    await expect(itemExists(col, item._id.toString())).resolves.toBeTrue();
    await expect(
      itemExists(col, item._id.toString(), { optimisticCoercion: false })
    ).resolves.toBeFalse();
  });

  it('respects excludeId option', async () => {
    expect.hasAssertions();

    const col = (await getDb({ name: 'root' })).collection('auth');
    const item =
      (await col.findOne<InternalAuthBearerEntry>()) ||
      toss(new TrialError('assert failed'));

    await expect(itemExists(col, item._id)).resolves.toBeTrue();
    await expect(
      itemExists(col, item._id, {
        excludeId: { key: 'token.bearer', id: item.token.bearer }
      })
    ).resolves.toBeFalse();

    await expect(
      itemExists(
        col,
        { key: 'token.bearer', id: item.token.bearer },
        {
          excludeId: item._id
        }
      )
    ).resolves.toBeFalse();
  });

  it('rejects if attempting to exclude using same property as id', async () => {
    expect.hasAssertions();

    const col = (await getDb({ name: 'root' })).collection('auth');
    const item =
      (await col.findOne<InternalAuthBearerEntry>()) ||
      toss(new TrialError('assert failed'));

    await expect(itemExists(col, item._id, { excludeId: item._id })).rejects.toThrow(
      'cannot lookup an item by property "_id"'
    );

    await expect(
      itemExists(
        col,
        { key: 'token.bearer', id: item.token.bearer },
        { excludeId: { key: 'token.bearer', id: item.token.bearer } }
      )
    ).rejects.toThrow('cannot lookup an item by property "token.bearer"');
  });

  it('respects caseInsensitive option', async () => {
    expect.hasAssertions();

    const col = (await getDb({ name: 'root' })).collection('auth');

    await expect(
      itemExists(
        col,
        { key: 'token.bearer', id: DUMMY_BEARER_TOKEN.toUpperCase() },
        { caseInsensitive: true }
      )
    ).resolves.toBeTrue();

    await expect(
      itemExists(col, { key: 'token.bearer', id: DUMMY_BEARER_TOKEN.toUpperCase() })
    ).resolves.toBeFalse();

    const item =
      (await col.findOne<InternalAuthBearerEntry>()) ||
      toss(new TrialError('assert failed'));

    await expect(itemExists(col, item._id)).resolves.toBeTrue();

    await expect(
      itemExists(col, item._id, {
        excludeId: { key: 'token.bearer', id: item.token.bearer.toUpperCase() }
      })
    ).resolves.toBeTrue();

    await expect(
      itemExists(col, item._id, {
        excludeId: { key: 'token.bearer', id: item.token.bearer.toUpperCase() },
        caseInsensitive: true
      })
    ).resolves.toBeFalse();
  });
});

describe('::itemToObjectId', () => {
  it('reduces an item down to its ObjectId instance', async () => {
    expect.hasAssertions();

    const id = new ObjectId();

    expect(itemToObjectId({ _id: id })).toBe(id);
    expect(itemToObjectId(id.toString())).toStrictEqual(id);
    expect(itemToObjectId(id)).toBe(id);
  });

  it('reduces an array of items down to ObjectId instances', async () => {
    expect.hasAssertions();

    const id = new ObjectId();
    const ids = [id, id, id];

    expect(itemToObjectId(ids)).toStrictEqual(ids);
    expect(itemToObjectId([{ _id: id }, { _id: id }, { _id: id }])).toStrictEqual(ids);
    expect(itemToObjectId([id.toString(), id.toString(), id.toString()])).toStrictEqual(
      ids
    );
  });

  it('throws if item is irreducible', async () => {
    expect.hasAssertions();

    expect(() => itemToObjectId(null)).toThrow('irreducible');
    expect(() => itemToObjectId(undefined)).toThrow('irreducible');
    expect(() => itemToObjectId([null])).toThrow('irreducible');
    expect(() => itemToObjectId([undefined])).toThrow('irreducible');
    // @ts-expect-error: bad param
    expect(() => itemToObjectId({})).toThrow('irreducible');
    // @ts-expect-error: bad param
    expect(() => itemToObjectId([{}])).toThrow('irreducible');
    expect(() => itemToObjectId('bad')).toThrow('must be a string of');
    expect(() => itemToObjectId(['bad'])).toThrow('must be a string of');
  });
});

describe('::itemToStringId', () => {
  it('reduces an item down to its string representation', async () => {
    expect.hasAssertions();

    const id = new ObjectId();
    const idString = id.toString();

    expect(itemToStringId({ _id: id })).toBe(idString);
    expect(itemToStringId(idString)).toBe(idString);
    expect(itemToStringId(id)).toBe(idString);
  });

  it('reduces an array of items down to string representations', async () => {
    expect.hasAssertions();

    const id = new ObjectId();
    const idStrings = [id.toString(), id.toString(), id.toString()];

    expect(itemToStringId(idStrings)).toStrictEqual(idStrings);
    expect(itemToStringId([{ _id: id }, { _id: id }, { _id: id }])).toStrictEqual(
      idStrings
    );

    expect(itemToStringId([id.toString(), id.toString(), id.toString()])).toStrictEqual(
      idStrings
    );
  });

  it('throws if item is irreducible', async () => {
    expect.hasAssertions();

    expect(() => itemToStringId(null)).toThrow('irreducible');
    expect(() => itemToStringId(undefined)).toThrow('irreducible');
    expect(() => itemToStringId([null])).toThrow('irreducible');
    expect(() => itemToStringId([undefined])).toThrow('irreducible');
    // @ts-expect-error: bad param
    expect(() => itemToStringId({})).toThrow('irreducible');
    // @ts-expect-error: bad param
    expect(() => itemToStringId([{}])).toThrow('irreducible');
    expect(() => itemToStringId('bad')).toThrow('must be a string of');
    expect(() => itemToStringId(['bad'])).toThrow('must be a string of');
  });
});
