import { BANNED_BEARER_TOKEN } from 'multiverse/next-auth';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { GuruMeditationError } from 'universe/error';
import { getDb } from 'multiverse/mongo-schema';
import { mockDateNowMs, useMockDateNow } from 'multiverse/mongo-common';

import {
  mockEnvFactory,
  protectedImportFactory,
  withMockedOutput
} from 'testverse/setup';

import type { InternalLimitedLogEntry } from 'multiverse/next-limit';
import type { InternalRequestLogEntry } from 'multiverse/next-log';
import { ObjectId } from 'mongodb';

// ? Ensure the isolated external picks up the memory server override
jest.mock('multiverse/mongo-schema', () => {
  return jest.requireActual('multiverse/mongo-schema');
});

const TEST_MARGIN_MS = 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

const withMockedEnv = mockEnvFactory({
  NODE_ENV: 'test',
  BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: '60',
  BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '100',
  BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '1',
  BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: '5',
  BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER: '4'
});

const importBanHammer = protectedImportFactory<
  typeof import('externals/ban-hammer').default
>({
  path: 'externals/ban-hammer',
  useDefault: true
});

setupMemoryServerOverride();
useMockDateNow();

const getRequestLogCollection = async () => {
  return (await getDb({ name: 'root' })).collection<InternalRequestLogEntry>(
    'request-log'
  );
};

const getRateLimitsCollection = async () => {
  return (await getDb({ name: 'root' })).collection<InternalLimitedLogEntry>(
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

it('becomes verbose when no DEBUG environment variable and NODE_ENV is not test', async () => {
  expect.hasAssertions();

  await withMockedOutput(async ({ infoSpy }) => {
    await withMockedEnv(importBanHammer, {
      DEBUG: undefined,
      NODE_ENV: 'something-else',
      OVERRIDE_EXPECT_ENV: 'force-no-check'
    });

    expect(infoSpy).toBeCalledWith(expect.stringContaining('execution complete'));
  });

  await withMockedOutput(async ({ infoSpy }) => {
    await withMockedEnv(importBanHammer);
    expect(infoSpy).not.toBeCalled();
  });
});

it('rejects on bad environment', async () => {
  expect.hasAssertions();

  await withMockedEnv(() => importBanHammer({ expectedExitCode: 2 }), {
    BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: ''
  });

  await withMockedEnv(() => importBanHammer({ expectedExitCode: 2 }), {
    BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: ''
  });

  await withMockedEnv(() => importBanHammer({ expectedExitCode: 2 }), {
    BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: ''
  });

  await withMockedEnv(() => importBanHammer({ expectedExitCode: 2 }), {
    BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: ''
  });

  await withMockedEnv(() => importBanHammer({ expectedExitCode: 2 }), {
    BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER: ''
  });
});

it('rate limits only those ips and auth headers that exceed limits', async () => {
  expect.hasAssertions();

  const now = ((n: number) => n - (n % 5000) - 1000)(mockDateNowMs);

  await (await getRateLimitsCollection()).deleteMany({});
  await (await getRequestLogCollection()).updateMany({}, { $set: { createdAt: now } });

  await withMockedEnv(importBanHammer, {
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
  ).updateMany({ header: `bearer ${BANNED_BEARER_TOKEN}` }, { $set: { ip: '9.8.7.6' } });

  await withMockedEnv(importBanHammer, {
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
    _id: new ObjectId(),
    ip: '1.2.3.4',
    header: `bearer ${BANNED_BEARER_TOKEN}`,
    method: 'PUT',
    resStatusCode: 200,
    route: 'jest/test',
    createdAt: now - 1000
  });

  await withMockedEnv(importBanHammer, {
    BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '11',
    BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '1'
  });

  await expect(getRateLimits()).resolves.toBeArrayOfSize(0);

  await withMockedEnv(importBanHammer, {
    BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '11',
    BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '5'
  });

  await expect(getRateLimits()).resolves.toIncludeSameMembers([
    { ip: '1.2.3.4' },
    { header: `bearer ${BANNED_BEARER_TOKEN}` }
  ]);

  await (await getRateLimitsCollection()).deleteMany({});

  await withMockedEnv(importBanHammer, {
    BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '11',
    BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '1'
  });

  await expect(getRateLimits()).resolves.toBeArrayOfSize(0);
});

it('rate limits with respect to invocation interval', async () => {
  expect.hasAssertions();

  await (await getRateLimitsCollection()).deleteMany({});

  const requestLogDb = await getRequestLogCollection();

  if (!(await requestLogDb.countDocuments({}))) {
    throw new GuruMeditationError('No request-log entry found?!');
  }

  const now = ((_now: number) => _now - (_now % 5000) - 2000)(mockDateNowMs);

  await requestLogDb.updateMany(
    { header: `bearer ${BANNED_BEARER_TOKEN}` },
    { $set: { ip: '9.8.7.6' } }
  );
  await requestLogDb.updateMany({}, { $set: { createdAt: now } });

  await withMockedEnv(importBanHammer, {
    BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10',
    BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '5',
    BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: '1'
  });

  await expect(getRateLimits()).resolves.toBeArrayOfSize(0);

  await withMockedEnv(importBanHammer, {
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
  ).updateMany({ header: `bearer ${BANNED_BEARER_TOKEN}` }, { $set: { ip: '9.8.7.6' } });

  const now = mockDateNowMs;
  let untils;

  await withMockedEnv(importBanHammer, {
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

  await withMockedEnv(importBanHammer, {
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

  await withMockedEnv(importBanHammer, {
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

  await withMockedEnv(importBanHammer);

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

  await withMockedEnv(importBanHammer);

  await expect(getRateLimits()).resolves.toIncludeSameMembers([
    { ip: '1.2.3.4' },
    { header: `bearer ${BANNED_BEARER_TOKEN}` }
  ]);
});
