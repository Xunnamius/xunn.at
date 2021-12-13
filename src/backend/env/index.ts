import { name as pkgName } from 'package';
import { parse as parseAsBytes } from 'bytes';
import { isServer } from 'is-server-side';
import { IllegalEnvironmentError } from 'universe/error';
import { validHttpMethods } from 'universe/backend';
import { getEnv as getCustomizedEnv } from 'universe/backend/env/app';
import debugFactory from 'debug';

import type { ValidHttpMethod } from 'universe/backend';

const debug = debugFactory(`${pkgName}:env`);

// TODO: unit test env.ts and other testable abstraction layers

const envToArray = (envVal: string) => {
  return envVal
    .replace(/[^A-Za-z0-9=.<>,-^~_*]+/g, '')
    .split(',')
    .filter(Boolean);
};

export function getEnv() {
  const env = getCustomizedEnv({
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
    LOCKOUT_ALL_KEYS:
      !!process.env.LOCKOUT_ALL_KEYS && process.env.LOCKOUT_ALL_KEYS !== 'false',
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
    DEBUG: process.env.DEBUG ?? null,
    DEBUG_INSPECTING: !!process.env.VSCODE_INSPECTOR_OPTIONS
  });

  debug(env);

  const errors = [];

  // TODO: retire all this logic when expect-env is created
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
    throw new IllegalEnvironmentError(
      `illegal environment detected:\n - ${errors.join('\n - ')}`
    );
  } else return env;
}
