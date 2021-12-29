import { parse as parseAsBytes } from 'bytes';
import { isServer } from 'is-server-side';
import { InvalidEnvironmentError } from 'named-app-errors';
import { validHttpMethods } from '@xunnamius/types';
import { debugFactory } from 'multiverse/debug-extended';

import type { ValidHttpMethod } from '@xunnamius/types';
import { Primitive } from 'type-fest';

const debug = debugFactory('next-env:env');

const envToArray = (envVal: string) => {
  return envVal
    .replace(/[^A-Za-z0-9=.<>,-^~_*]+/g, '')
    .split(',')
    .filter(Boolean);
};

export type Environment = Record<string, Primitive | Primitive[]>;

/**
 * Returns an object representing the current runtime environment.
 */
export function getEnv<T extends Environment>(customizedEnv?: T) {
  const env = {
    NODE_ENV:
      process.env.APP_ENV || process.env.NODE_ENV || process.env.BABEL_ENV || 'unknown',
    MONGODB_URI: process.env.MONGODB_URI || '',
    MONGODB_MS_PORT: !!process.env.MONGODB_MS_PORT
      ? Number(process.env.MONGODB_MS_PORT)
      : null,
    DISABLED_API_VERSIONS: !!process.env.DISABLED_API_VERSIONS
      ? envToArray(process.env.DISABLED_API_VERSIONS.toLowerCase())
      : [],
    RESULTS_PER_PAGE: Number(process.env.RESULTS_PER_PAGE),
    IGNORE_RATE_LIMITS:
      !!process.env.IGNORE_RATE_LIMITS && process.env.IGNORE_RATE_LIMITS !== 'false',
    LOCKOUT_ALL_CLIENTS:
      !!process.env.LOCKOUT_ALL_CLIENTS && process.env.LOCKOUT_ALL_CLIENTS !== 'false',
    DISALLOWED_METHODS: !!process.env.DISALLOWED_METHODS
      ? envToArray(process.env.DISALLOWED_METHODS.toUpperCase())
      : [],
    MAX_CONTENT_LENGTH_BYTES: parseAsBytes(
      process.env.MAX_CONTENT_LENGTH_BYTES ?? '-Infinity'
    ),
    EXTERNAL_SCRIPTS_MONGODB_URI: (
      process.env.EXTERNAL_SCRIPTS_MONGODB_URI ||
      process.env.MONGODB_URI ||
      ''
    ).toString(),
    AUTH_HEADER_MAX_LENGTH: Number(process.env.AUTH_HEADER_MAX_LENGTH) || 500,
    DEBUG: process.env.DEBUG ?? null,
    DEBUG_INSPECTING: !!process.env.VSCODE_INSPECTOR_OPTIONS,
    REQUESTS_PER_CONTRIVED_ERROR: Number(process.env.REQUESTS_PER_CONTRIVED_ERROR) || 0,

    BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS: !!process.env
      .BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS
      ? Number(process.env.BAN_HAMMER_WILL_BE_CALLED_EVERY_SECONDS)
      : null,
    BAN_HAMMER_MAX_REQUESTS_PER_WINDOW: !!process.env.BAN_HAMMER_MAX_REQUESTS_PER_WINDOW
      ? Number(process.env.BAN_HAMMER_MAX_REQUESTS_PER_WINDOW)
      : null,
    BAN_HAMMER_RESOLUTION_WINDOW_SECONDS: !!process.env
      .BAN_HAMMER_RESOLUTION_WINDOW_SECONDS
      ? Number(process.env.BAN_HAMMER_RESOLUTION_WINDOW_SECONDS)
      : null,
    BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES: !!process.env.BAN_HAMMER_DEFAULT_BAN_TIME_MINUTES
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

  debug(env);

  // TODO: retire all of the following logic when expect-env is created

  const errors = [];

  const envIsGtZero = (name: keyof typeof env) => {
    if (
      typeof env[name] != 'number' ||
      isNaN(env[name] as number) ||
      (env[name] as number) < 0
    ) {
      errors.push(`bad ${name}, saw "${env[name]}" (expected a non-negative number)`);
    }
  };

  if (env.NODE_ENV == 'unknown') errors.push(`bad NODE_ENV, saw "${env.NODE_ENV}"`);

  // TODO: expect-env should cover this use-case (server-only) as well
  if (isServer()) {
    if (env.MONGODB_URI === '') errors.push(`bad MONGODB_URI, saw "${env.MONGODB_URI}"`);

    (['RESULTS_PER_PAGE', 'MAX_CONTENT_LENGTH_BYTES'] as (keyof typeof env)[]).forEach(
      (name) => envIsGtZero(name)
    );

    env.DISALLOWED_METHODS.forEach((method) => {
      if (!validHttpMethods.includes(method as ValidHttpMethod)) {
        errors.push(
          `unknown method "${method}", must be one of: ${validHttpMethods.join(', ')}`
        );
      }
    });

    if (env.MONGODB_MS_PORT && env.MONGODB_MS_PORT <= 1024) {
      errors.push(`optional environment variable MONGODB_MS_PORT must be > 1024`);
    }
  }

  if (errors.length) {
    throw new InvalidEnvironmentError(
      `illegal environment detected:\n - ${errors.join('\n - ')}`
    );
  } else return env as typeof env & T;
}