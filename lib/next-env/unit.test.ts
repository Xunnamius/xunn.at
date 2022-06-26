import { getEnv } from 'multiverse/next-env';
import { withMockedEnv } from 'testverse/setup';

describe('::getEnv', () => {
  it('returns object with respect to process.env', async () => {
    expect.hasAssertions();

    await withMockedEnv(
      () => {
        expect(getEnv()).toStrictEqual({
          OVERRIDE_EXPECT_ENV: undefined,
          NODE_ENV: 'known',
          MONGODB_URI: 'uri',
          MONGODB_MS_PORT: null,
          DISABLED_API_VERSIONS: [],
          RESULTS_PER_PAGE: 5,
          IGNORE_RATE_LIMITS: false,
          LOCKOUT_ALL_CLIENTS: false,
          DISALLOWED_METHODS: [],
          MAX_CONTENT_LENGTH_BYTES: 1024,
          AUTH_HEADER_MAX_LENGTH: 500,
          DEBUG: null,
          DEBUG_INSPECTING: false,
          REQUESTS_PER_CONTRIVED_ERROR: 0,
          BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: null,
          BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: null,
          BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: null,
          BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: null,
          BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER: null,
          PRUNE_DATA_MAX_LOGS: null,
          PRUNE_DATA_MAX_BANNED: null
        });
      },
      {
        BABEL_ENV: 'known',
        MONGODB_URI: 'uri',
        RESULTS_PER_PAGE: '5',
        MAX_CONTENT_LENGTH_BYTES: '1KB'
      }
    );

    // TODO: retire this test and/or merge it into expect-env
    await withMockedEnv(() => {
      expect(() => getEnv()).toThrow(`bad variables:
 - bad NODE_ENV, saw "unknown"
 - bad MONGODB_URI, saw ""`);
    }, {});
  });

  // TODO: retire the next two checks and fold them into expect-env instead

  it('does not run expect-env if NODE_ENV is not "test"', async () => {
    expect.hasAssertions();

    await withMockedEnv(
      () => {
        expect(getEnv()).toStrictEqual({
          OVERRIDE_EXPECT_ENV: undefined,
          NODE_ENV: 'test',
          MONGODB_URI: 'uri',
          MONGODB_MS_PORT: 1234,
          DISABLED_API_VERSIONS: ['one', '2', 'three'],
          RESULTS_PER_PAGE: 5,
          IGNORE_RATE_LIMITS: false,
          LOCKOUT_ALL_CLIENTS: true,
          DISALLOWED_METHODS: ['FAKE'],
          MAX_CONTENT_LENGTH_BYTES: 1024,
          AUTH_HEADER_MAX_LENGTH: 50,
          DEBUG: 'false',
          DEBUG_INSPECTING: true,
          REQUESTS_PER_CONTRIVED_ERROR: 5,
          BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: 10,
          BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: 15,
          BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: 20,
          BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: 25,
          BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER: 30,
          PRUNE_DATA_MAX_LOGS: 35,
          PRUNE_DATA_MAX_BANNED: 40
        });
      },
      {
        NODE_ENV: 'test',
        MONGODB_URI: 'uri',
        MONGODB_MS_PORT: '1234',
        DISABLED_API_VERSIONS: 'one, 2, three',
        RESULTS_PER_PAGE: '5',
        IGNORE_RATE_LIMITS: 'false',
        LOCKOUT_ALL_CLIENTS: 'true',
        DISALLOWED_METHODS: 'FAKE',
        MAX_CONTENT_LENGTH_BYTES: '1KB',
        AUTH_HEADER_MAX_LENGTH: '50',
        DEBUG: 'false',
        VSCODE_INSPECTOR_OPTIONS: 'inspector',
        REQUESTS_PER_CONTRIVED_ERROR: '5',
        BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: '10',
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '15',
        BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '20',
        BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: '25',
        BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER: '30',
        PRUNE_DATA_MAX_LOGS: '35',
        PRUNE_DATA_MAX_BANNED: '40'
      }
    );
  });

  it('respects OVERRIDE_EXPECT_ENV', async () => {
    expect.hasAssertions();

    await withMockedEnv(
      () => {
        expect(() => getEnv()).toThrow(/bad/);
      },
      {
        OVERRIDE_EXPECT_ENV: 'force-check',
        NODE_ENV: 'test',
        MONGODB_URI: 'uri',
        MONGODB_MS_PORT: '1234',
        DISABLED_API_VERSIONS: 'one, 2, three',
        RESULTS_PER_PAGE: '5',
        IGNORE_RATE_LIMITS: 'false',
        LOCKOUT_ALL_CLIENTS: 'true',
        DISALLOWED_METHODS: 'FAKE',
        MAX_CONTENT_LENGTH_BYTES: '1KB',
        AUTH_HEADER_MAX_LENGTH: '50',
        DEBUG: 'false',
        VSCODE_INSPECTOR_OPTIONS: 'inspector',
        REQUESTS_PER_CONTRIVED_ERROR: '5',
        BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: '10',
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '15',
        BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '20',
        BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: '25',
        BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER: '30',
        PRUNE_DATA_MAX_LOGS: '35',
        PRUNE_DATA_MAX_BANNED: '40'
      }
    );

    await withMockedEnv(
      () => {
        expect(() => getEnv()).not.toThrow();
      },
      {
        OVERRIDE_EXPECT_ENV: 'force-no-check',
        NODE_ENV: 'test',
        MONGODB_URI: 'uri',
        MONGODB_MS_PORT: '1234',
        DISABLED_API_VERSIONS: 'one, 2, three',
        RESULTS_PER_PAGE: '5',
        IGNORE_RATE_LIMITS: 'false',
        LOCKOUT_ALL_CLIENTS: 'true',
        DISALLOWED_METHODS: 'FAKE',
        MAX_CONTENT_LENGTH_BYTES: '1KB',
        AUTH_HEADER_MAX_LENGTH: '50',
        DEBUG: 'false',
        VSCODE_INSPECTOR_OPTIONS: 'inspector',
        REQUESTS_PER_CONTRIVED_ERROR: '5',
        BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: '10',
        BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: '15',
        BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: '20',
        BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: '25',
        BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER: '30',
        PRUNE_DATA_MAX_LOGS: '35',
        PRUNE_DATA_MAX_BANNED: '40'
      }
    );
  });

  it('throws on invalid OVERRIDE_EXPECT_ENV', async () => {
    expect.hasAssertions();

    await withMockedEnv(
      () => {
        expect(() => getEnv()).toThrow(/must have value "force-check"/);
      },
      { OVERRIDE_EXPECT_ENV: '' }
    );
  });
});
