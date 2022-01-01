import banHammer from 'externals/ban-hammer';
import { BANNED_BEARER_TOKEN } from 'multiverse/next-auth';
import { setupTestDb } from 'multiverse/mongo-test';
import { GuruMeditationError } from 'universe/error';
import { mockEnvFactory } from 'testverse/setup';
import { getDb } from 'multiverse/mongo-schema';
import { generatedAt } from 'multiverse/mongo-common';

import type { InternalLimitedLogEntry } from 'multiverse/next-limit';
import type { InternalRequestLogEntry } from 'multiverse/next-log';
import type { WithId } from 'mongodb';

const TEST_MARGIN_MS = 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

const withMockedEnv = mockEnvFactory({ NODE_ENV: 'test' });

setupTestDb();

const getRequestLogCollection = async () => {
  return (await getDb({ name: 'root' })).collection<WithId<InternalRequestLogEntry>>(
    'request-log'
  );
};

const getRateLimitsCollection = async () => {
  return (await getDb({ name: 'root' })).collection<WithId<InternalLimitedLogEntry>>(
    'limited-log'
  );
};

const getRateLimits = async () => {
  return (await getRateLimitsCollection())
    .find()
    .project({ _id: 0, ip: 1, header: 1 })
    .toArray();
};

const getRateLimitUntils = async () => {
  return (await getRateLimitsCollection()).find().project({ _id: 0, until: 1 }).toArray();
};

describe('external-scripts/ban-hammer', () => {
  it('rate limits only those ips and auth headers that exceed limits', async () => {
    expect.hasAssertions();

    const now = ((n: number) => n - (n % 5000) - 1000)(generatedAt);

    await (await getRateLimitsCollection()).deleteMany({});
    await (await getRequestLogCollection()).updateMany({}, { $set: { createdAt: now } });

    await withMockedEnv(banHammer, {
      BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10',
      BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '1'
    });

    await expect(getRateLimits()).resolves.toIncludeSameMembers([
      { ip: '1.2.3.4' },
      { header: `bearer ${BANNED_BEARER_TOKEN}` }
    ]);

    await (await getRateLimitsCollection()).deleteMany({});
    await (
      await getRequestLogCollection()
    ).updateMany(
      { header: `bearer ${BANNED_BEARER_TOKEN}` },
      { $set: { ip: '9.8.7.6' } }
    );

    await withMockedEnv(banHammer, {
      BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10',
      BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '1'
    });

    await expect(getRateLimits()).resolves.toIncludeSameMembers([
      { ip: '1.2.3.4' },
      { ip: '9.8.7.6' },
      { header: `bearer ${BANNED_BEARER_TOKEN}` }
    ]);

    await (await getRateLimitsCollection()).deleteMany({});
    await (
      await getRequestLogCollection()
    ).insertOne({
      ip: '1.2.3.4',
      header: `bearer ${BANNED_BEARER_TOKEN}`,
      method: 'PUT',
      resStatusCode: 200,
      route: 'jest/test',
      createdAt: now - 1000
    });

    await withMockedEnv(banHammer, {
      BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '11',
      BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '1'
    });

    await expect(getRateLimits()).resolves.toBeArrayOfSize(0);

    await withMockedEnv(banHammer, {
      BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '11',
      BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '5'
    });

    await expect(getRateLimits()).resolves.toIncludeSameMembers([
      { ip: '1.2.3.4' },
      { header: `bearer ${BANNED_BEARER_TOKEN}` }
    ]);

    await (await getRateLimitsCollection()).deleteMany({});

    await withMockedEnv(banHammer, {
      BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '11',
      BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '1'
    });

    await expect(getRateLimits()).resolves.toBeArrayOfSize(0);
  });

  it('rate limits with respect to invocation interval', async () => {
    expect.hasAssertions();

    await (await getRateLimitsCollection()).deleteMany({});

    const requestLogDb = await getRequestLogCollection();
    const requestLogEntry = await requestLogDb.find().limit(1).next();

    if (!requestLogEntry) throw new GuruMeditationError('No request-log entry found?!');

    const now = ((_now: number) => _now - (_now % 5000) - 2000)(generatedAt);

    await requestLogDb.updateMany(
      { header: `bearer ${BANNED_BEARER_TOKEN}` },
      { $set: { ip: '9.8.7.6' } }
    );
    await requestLogDb.updateMany({}, { $set: { createdAt: now } });

    await withMockedEnv(banHammer, {
      BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10',
      BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '5',
      BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: '1'
    });

    await expect(getRateLimits()).resolves.toBeArrayOfSize(0);

    await withMockedEnv(banHammer, {
      BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10',
      BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '5',
      BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: '8'
    });

    await expect(getRateLimits()).resolves.toIncludeSameMembers([
      { header: `bearer ${BANNED_BEARER_TOKEN}` },
      { ip: '9.8.7.6' },
      { ip: '1.2.3.4' }
    ]);
  });

  it('repeat offenders are punished to the maximum extent', async () => {
    expect.hasAssertions();

    await (await getRateLimitsCollection()).deleteMany({});
    await (
      await getRequestLogCollection()
    ).updateMany(
      { header: `bearer ${BANNED_BEARER_TOKEN}` },
      { $set: { ip: '9.8.7.6' } }
    );

    const now = generatedAt;
    let untils;

    await withMockedEnv(banHammer, {
      BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: '10',
      BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10'
    });

    untils = await getRateLimitUntils();
    expect(untils).toBeArrayOfSize(3);

    untils.forEach((u) => {
      expect(u.until).toBeWithin(
        now + TEN_MINUTES_MS - TEST_MARGIN_MS,
        now + TEN_MINUTES_MS + TEST_MARGIN_MS
      );
    });

    await (await getRateLimitsCollection()).deleteMany({});

    await withMockedEnv(banHammer, {
      BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: '20',
      BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10'
    });

    untils = await getRateLimitUntils();
    expect(untils).toBeArrayOfSize(3);

    untils.forEach((u) => {
      expect(u.until).toBeWithin(
        now + 2 * TEN_MINUTES_MS - TEST_MARGIN_MS,
        now + 2 * TEN_MINUTES_MS + TEST_MARGIN_MS
      );
    });

    await withMockedEnv(banHammer, {
      BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: '20',
      BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10',
      BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER: '5'
    });

    untils = await getRateLimitUntils();
    expect(untils).toBeArrayOfSize(3);

    untils.forEach((u) => {
      expect(u.until).toBeWithin(
        now + 10 * TEN_MINUTES_MS - TEST_MARGIN_MS,
        now + 10 * TEN_MINUTES_MS + TEST_MARGIN_MS
      );
    });
  });

  it('does not replace longer bans with shorter bans', async () => {
    expect.hasAssertions();

    await expect(getRateLimits()).resolves.toBeArrayOfSize(3);

    await (
      await getRateLimitsCollection()
    ).updateMany({ ip: { $ne: '5.6.7.8' } }, { $set: { until: 9998784552826 } });
    await banHammer();

    let saw = 0;
    (await getRateLimitUntils()).forEach((u) => u.until == 9998784552826 && saw++);

    expect(saw).toBe(2);
  });

  it('deletes outdated entries outside the punishment period', async () => {
    expect.hasAssertions();

    await expect(getRateLimits()).resolves.toBeArrayOfSize(3);

    await (
      await getRateLimitsCollection()
    ).updateMany({ ip: '5.6.7.8' }, { $set: { until: 0 } });
    await banHammer();

    await expect(getRateLimits()).resolves.toIncludeSameMembers([
      { ip: '1.2.3.4' },
      { header: `bearer ${BANNED_BEARER_TOKEN}` }
    ]);
  });
});
