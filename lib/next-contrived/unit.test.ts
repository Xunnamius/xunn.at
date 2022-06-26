import { dummyRootData, useMockDateNow } from 'multiverse/mongo-common';
import { getDb } from 'multiverse/mongo-schema';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { isDueForContrivedError } from 'multiverse/next-contrived';
import { mockEnvFactory } from 'testverse/setup';

setupMemoryServerOverride();
useMockDateNow();

const withMockedEnv = mockEnvFactory({ NODE_ENV: 'test' });
const { _id, ...entry } = dummyRootData['request-log'][0];

beforeEach(async () => {
  await (await getDb({ name: 'root' })).collection('request-log').deleteMany({});
});

describe('::isDueForContrivedError', () => {
  it('returns true every 1st call', async () => {
    expect.hasAssertions();

    const db = (await getDb({ name: 'root' })).collection('request-log');

    await withMockedEnv(
      async () => {
        await expect(isDueForContrivedError()).resolves.toBeTrue();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeTrue();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeTrue();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeTrue();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '1' }
    );
  });

  it('returns true every 2nd call', async () => {
    expect.hasAssertions();

    const db = (await getDb({ name: 'root' })).collection('request-log');

    await withMockedEnv(
      async () => {
        await expect(isDueForContrivedError()).resolves.toBeTrue();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeTrue();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '2' }
    );
  });

  it('returns true every 3rd call', async () => {
    expect.hasAssertions();

    const db = (await getDb({ name: 'root' })).collection('request-log');

    await withMockedEnv(
      async () => {
        await expect(isDueForContrivedError()).resolves.toBeTrue();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeTrue();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '3' }
    );
  });

  it('returns true every 4th call', async () => {
    expect.hasAssertions();

    const db = (await getDb({ name: 'root' })).collection('request-log');

    await withMockedEnv(
      async () => {
        await expect(isDueForContrivedError()).resolves.toBeTrue();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeTrue();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '4' }
    );
  });

  it('returns true every 5th call', async () => {
    expect.hasAssertions();

    const db = (await getDb({ name: 'root' })).collection('request-log');

    await withMockedEnv(
      async () => {
        await expect(isDueForContrivedError()).resolves.toBeTrue();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeTrue();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '5' }
    );
  });

  it('middleware disabled when REQUESTS_PER_CONTRIVED_ERROR=0', async () => {
    expect.hasAssertions();

    const db = (await getDb({ name: 'root' })).collection('request-log');

    await withMockedEnv(
      async () => {
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
        await db.insertOne({ ...entry });
        await expect(isDueForContrivedError()).resolves.toBeFalse();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '0' }
    );
  });
});
