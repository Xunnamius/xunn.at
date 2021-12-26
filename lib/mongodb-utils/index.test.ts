import { ObjectId } from 'mongodb';
import { asMockedClass } from '@xunnamius/jest-types';

jest.mock('mongodb');

const mockObjectId = asMockedClass(ObjectId);

describe('::itemExists', () => {
  it('returns true if an item exists in a collection where [key] == id', () => {
    expect.hasAssertions();
  });

  it('respects exclude_id option', async () => {
    expect.hasAssertions();
  });

  it('respects caseInsensitive option', async () => {
    expect.hasAssertions();
  });
});

describe('::itemToObjectId', () => {
  it('reduces an item down to its ObjectId instance', async () => {
    expect.hasAssertions();
  });

  it('reduces an array of items down to ObjectId instances', async () => {
    expect.hasAssertions();
  });
});

describe('::itemToStringId', () => {
  it('reduces an item down to its ObjectId string representation', async () => {
    expect.hasAssertions();
  });

  it('reduces an array of items down to ObjectId string representations', async () => {
    expect.hasAssertions();
  });
});
