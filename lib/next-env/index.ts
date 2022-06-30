import { parse as parseAsBytes } from 'bytes';
import { isServer } from 'is-server-side';
import { InvalidAppEnvironmentError } from 'named-app-errors';
import { toss } from 'toss-expression';
import { validHttpMethods } from '@xunnamius/types';
import { debugFactory } from 'multiverse/debug-extended';

import type { ValidHttpMethod } from '@xunnamius/types';
import type { Primitive } from 'type-fest';

const debug = debugFactory('next-env:env');

// * NOTE: next-env does not invoke dotenv or load any .env files for you,
// * you'll have to do that manually. For Next.js apps, this is the desired
// * behavior since environment variables are defined as secrets. Further note
// * that Webpack and Jest configurations are setup to load .env files for you.

/**
 * This method takes an environment variable value (string), removes illegal
 * characters, and then splits the string by its commas, returning the resulting
 * array with all nullish members filtered out.
 */
export const envToArray = (envVal: string) => {
  return envVal
    .replace(/[^A-Za-z0-9=.<>,-^~_*]+/g, '')
    .split(',')
    .filter(Boolean);
};

export type Environment = Record<string, Primitive | Primitive[]>;

type OverrideEnvExpect = 'force-check' | 'force-no-check' | undefined;

/**
 * Returns an object representing the current runtime environment.
 */
export function getEnv<T extends Environment>(customizedEnv?: T) {
  debug(
    `environment definitions (resolved as NODE_ENV) listed in order of precedence:`
  );
  debug(`APP_ENV: ${process.env.APP_ENV ?? '(undefined)'}`);
  debug(`NODE_ENV: ${process.env.NODE_ENV ?? '(undefined)'}`);
  debug(`BABEL_ENV: ${process.env.BABEL_ENV ?? '(undefined)'}`);

  const env = {
    OVERRIDE_EXPECT_ENV:
      process.env.OVERRIDE_EXPECT_ENV == 'force-check' ||
      process.env.OVERRIDE_EXPECT_ENV == 'force-no-check' ||
      process.env.OVERRIDE_EXPECT_ENV === undefined
        ? (process.env.OVERRIDE_EXPECT_ENV as OverrideEnvExpect)
        : toss(
            new InvalidAppEnvironmentError(
              'OVERRIDE_EXPECT_ENV must have value "force-check", "force-no-check", or undefined'
            )
          ),
    NODE_ENV:
      process.env.APP_ENV ||
      process.env.NODE_ENV ||
      process.env.BABEL_ENV ||
      'unknown',
    MONGODB_URI: process.env.MONGODB_URI || '',
    MONGODB_MS_PORT: !!process.env.MONGODB_MS_PORT
      ? Number(process.env.MONGODB_MS_PORT)
      : null,
    DISABLED_API_VERSIONS: !!process.env.DISABLED_API_VERSIONS
      ? envToArray(process.env.DISABLED_API_VERSIONS.toLowerCase())
      : [],
    RESULTS_PER_PAGE: Number(process.env.RESULTS_PER_PAGE) || 100,
    IGNORE_RATE_LIMITS:
      !!process.env.IGNORE_RATE_LIMITS && process.env.IGNORE_RATE_LIMITS !== 'false',
    LOCKOUT_ALL_CLIENTS:
      !!process.env.LOCKOUT_ALL_CLIENTS &&
      process.env.LOCKOUT_ALL_CLIENTS !== 'false',
    DISALLOWED_METHODS: !!process.env.DISALLOWED_METHODS
      ? envToArray(process.env.DISALLOWED_METHODS.toUpperCase())
      : [],
    MAX_CONTENT_LENGTH_BYTES:
      parseAsBytes(process.env.MAX_CONTENT_LENGTH_BYTES ?? '-Infinity') || 102400,
    AUTH_HEADER_MAX_LENGTH: Number(process.env.AUTH_HEADER_MAX_LENGTH) || 500,
    DEBUG: process.env.DEBUG ?? null,
    DEBUG_INSPECTING: !!process.env.VSCODE_INSPECTOR_OPTIONS,
    REQUESTS_PER_CONTRIVED_ERROR:
      Number(process.env.REQUESTS_PER_CONTRIVED_ERROR) || 0,

    BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: !!process.env
      .BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS
      ? Number(process.env.BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS)
      : null,
    BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: !!process.env
      .BAN_HAMMER_MAX_REQUESTS_PER_WINDOW
      ? Number(process.env.BAN_HAMMER_MAX_REQUESTS_PER_WINDOW)
      : null,
    BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: !!process.env
      .BAN_HAMMER_RESOLUTION_WINDOW_SECONDS
      ? Number(process.env.BAN_HAMMER_RESOLUTION_WINDOW_SECONDS)
      : null,
    BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: !!process.env
      .BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES
      ? Number(process.env.BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES)
      : null,
    BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER: !!process.env
      .BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER
      ? Number(process.env.BAN_HAMMER_RECIDIVISM_PUNISH_MULTIPLIER)
      : null,
    PRUNE_DATA_MAX_LOGS: !!process.env.PRUNE_DATA_MAX_LOGS
      ? Number(process.env.PRUNE_DATA_MAX_LOGS)
      : null,
    PRUNE_DATA_MAX_BANNED: !!process.env.PRUNE_DATA_MAX_BANNED
      ? Number(process.env.PRUNE_DATA_MAX_BANNED)
      : null,

    ...customizedEnv
  };

  debug('resolved env vars:');
  debug(env);

  // TODO: when the following logic is retired, consider renaming this package
  // TODO: to `@xunnamius/env` or something similar since it's not next-specific

  // TODO: when in production, perhaps these checks should only be run once?
  // TODO: Maybe this entire module should be cached? How does that work with
  // TODO: downstream getEnv decorators (like `universe/env`)?

  // TODO: retire all of the following logic when expect-env is created. Also,
  // TODO: expect-env should have the ability to skip runs on certain NODE_ENV
  // TODO: unless OVERRIDE_EXPECT_ENV is properly defined.
  /* istanbul ignore next */
  if (
    (env.NODE_ENV != 'test' && env.OVERRIDE_EXPECT_ENV != 'force-no-check') ||
    env.OVERRIDE_EXPECT_ENV == 'force-check'
  ) {
    const errors = [];
    const envIsGtZero = (name: keyof typeof env) => {
      if (
        typeof env[name] != 'number' ||
        isNaN(env[name] as number) ||
        (env[name] as number) < 0
      ) {
        errors.push(
          `bad ${name}, saw "${env[name]}" (expected a non-negative number)`
        );
      }
    };

    if (env.NODE_ENV == 'unknown') errors.push(`bad NODE_ENV, saw "${env.NODE_ENV}"`);

    // TODO: expect-env should cover this use-case (server-only) as well.
    if (isServer()) {
      if (env.MONGODB_URI === '')
        errors.push(`bad MONGODB_URI, saw "${env.MONGODB_URI}"`);

      (
        [
          'RESULTS_PER_PAGE',
          'MAX_CONTENT_LENGTH_BYTES',
          'AUTH_HEADER_MAX_LENGTH'
        ] as (keyof typeof env)[]
      ).forEach((name) => envIsGtZero(name));

      env.DISALLOWED_METHODS.forEach((method) => {
        if (!validHttpMethods.includes(method as ValidHttpMethod)) {
          errors.push(
            `unknown method "${method}", must be one of: ${validHttpMethods.join(
              ', '
            )}`
          );
        }
      });

      if (env.MONGODB_MS_PORT && env.MONGODB_MS_PORT <= 1024) {
        errors.push(`optional environment variable MONGODB_MS_PORT must be > 1024`);
      }
    }

    if (errors.length) {
      throw new InvalidAppEnvironmentError(
        `bad variables:\n - ${errors.join('\n - ')}`
      );
    }
  }

  return env as typeof env & T;
}
