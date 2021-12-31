import { BANNED_TOKEN } from 'universe/backend';
import { setupTestDb } from 'testverse/db';
import { GuruMeditationError } from 'universe/error';
import { withMockedEnv } from 'testverse/setup';
import banHammer from 'externals/ban-hammer';

import type { InternalRequestLogEntry, InternalLimitedLogEntry } from 'types/global';
import type { WithId } from 'mongodb';

const TEST_MARGIN_MS = 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

const { getDb } = setupTestDb();

const getRequestLogCollection = async () =>
  (await getDb({ name: 'root' })).collection<WithId<InternalRequestLogEntry>>(
    'request-log'
  );

const getRateLimitsCollection = async () =>
  (await getDb({ name: 'root' })).collection<WithId<InternalLimitedLogEntry>>(
    'limited-log'
  );

const getRateLimits = async () =>
  (await getRateLimitsCollection()).find().project({ _id: 0, ip: 1, key: 1 }).toArray();

const getRateLimitUntils = async () =>
  (await getRateLimitsCollection()).find().project({ _id: 0, until: 1 }).toArray();

describe('external-scripts/ban-hammer', () => {
  it('rate limits only those ips/keys that exceed limits', async () => {
    expect.hasAssertions();

    const now = ((n: number) => n - (n % 5000) - 1000)(Date.now());

    await (await getRateLimitsCollection()).deleteMany({});
    await (await getRequestLogCollection()).updateMany({}, { $set: { time: now } });

    await withMockedEnv(
      banHammer,
      {
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10',
        BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '1'
      },
      { replace: false }
    );

    await expect(getRateLimits()).resolves.toIncludeSameMembers([
      { ip: '1.2.3.4' },
      { key: BANNED_TOKEN }
    ]);

    await (await getRateLimitsCollection()).deleteMany({});
    await (
      await getRequestLogCollection()
    ).updateMany({ key: BANNED_TOKEN }, { $set: { ip: '9.8.7.6' } });

    await withMockedEnv(
      banHammer,
      {
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10',
        BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '1'
      },
      { replace: false }
    );

    await expect(getRateLimits()).resolves.toIncludeSameMembers([
      { ip: '1.2.3.4' },
      { ip: '9.8.7.6' },
      { key: BANNED_TOKEN }
    ]);

    await (await getRateLimitsCollection()).deleteMany({});
    await (
      await getRequestLogCollection()
    ).insertOne({
      ip: '1.2.3.4',
      key: BANNED_TOKEN,
      method: 'PUT',
      resStatusCode: 200,
      route: 'jest/test',
      time: now - 1000
    });

    await withMockedEnv(
      banHammer,
      {
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '11',
        BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '1'
      },
      { replace: false }
    );

    await expect(getRateLimits()).resolves.toBeArrayOfSize(0);

    await withMockedEnv(
      banHammer,
      {
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '11',
        BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '5'
      },
      { replace: false }
    );

    await expect(getRateLimits()).resolves.toIncludeSameMembers([
      { ip: '1.2.3.4' },
      { key: BANNED_TOKEN }
    ]);

    await (await getRateLimitsCollection()).deleteMany({});

    await withMockedEnv(
      banHammer,
      {
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '11',
        BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '1'
      },
      { replace: false }
    );

    await expect(getRateLimits()).resolves.toBeArrayOfSize(0);
  });

  it('rate limits with respect to invocation interval', async () => {
    expect.hasAssertions();

    await (await getRateLimitsCollection()).deleteMany({});

    const requestLogDb = await getRequestLogCollection();
    const requestLogEntry = await requestLogDb.find().limit(1).next();

    if (!requestLogEntry) throw new GuruMeditationError('No request-log entry found?!');

    const now = ((_now: number) => _now - (_now % 5000) - 2000)(Date.now());

    await requestLogDb.updateMany({ key: BANNED_TOKEN }, { $set: { ip: '9.8.7.6' } });
    await requestLogDb.updateMany({}, { $set: { time: now } });

    await withMockedEnv(
      banHammer,
      {
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10',
        BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '5',
        BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: '1'
      },
      { replace: false }
    );

    await expect(getRateLimits()).resolves.toBeArrayOfSize(0);

    await withMockedEnv(
      banHammer,
      {
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10',
        BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '5',
        BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: '8'
      },
      { replace: false }
    );

    await expect(getRateLimits()).resolves.toIncludeSameMembers([
      { key: BANNED_TOKEN },
      { ip: '9.8.7.6' },
      { ip: '1.2.3.4' }
    ]);
  });

  it('repeat offenders are punished to the maximum extent', async () => {
    expect.hasAssertions();

    await (await getRateLimitsCollection()).deleteMany({});
    await (
      await getRequestLogCollection()
    ).updateMany({ key: BANNED_TOKEN }, { $set: { ip: '9.8.7.6' } });

    const now = Date.now();
    let untils;

    await withMockedEnv(
      banHammer,
      {
        BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: '10',
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10'
      },
      { replace: false }
    );

    untils = await getRateLimitUntils();
    expect(untils).toBeArrayOfSize(3);

    untils.forEach((u) => {
      expect(u.until).toBeWithin(
        now + TEN_MINUTES_MS - TEST_MARGIN_MS,
        now + TEN_MINUTES_MS + TEST_MARGIN_MS
      );
    });

    await (await getRateLimitsCollection()).deleteMany({});

    await withMockedEnv(
      banHammer,
      {
        BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: '20',
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10'
      },
      { replace: false }
    );

    untils = await getRateLimitUntils();
    expect(untils).toBeArrayOfSize(3);

    untils.forEach((u) => {
      expect(u.until).toBeWithin(
        now + 2 * TEN_MINUTES_MS - TEST_MARGIN_MS,
        now + 2 * TEN_MINUTES_MS + TEST_MARGIN_MS
      );
    });

    await withMockedEnv(
      banHammer,
      {
        BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: '20',
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '10',
        BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER: '5'
      },
      { replace: false }
    );

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
      { key: BANNED_TOKEN }
    ]);
  });
});
