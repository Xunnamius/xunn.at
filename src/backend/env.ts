import { name as pkgName } from 'package';
import { parse as parseAsBytes } from 'bytes';
import { isServer } from 'is-server-side';
import { IllegalEnvironmentError } from 'universe/backend/error';
import debugFactory from 'debug';

const debug = debugFactory(`${pkgName}:env`);

const HTTP2_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'CONNECT',
  'OPTIONS',
  'TRACE',
  'PATCH'
];

// TODO: unit test env.ts and other testable abstraction layers

const envToArray = (envVal: string) => {
  return envVal
    .replace(/[^A-Za-z0-9=.<>,-^~_*]+/g, '')
    .split(',')
    .filter(Boolean);
};

export function getEnv() {
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
    LOCKOUT_ALL_KEYS:
      !!process.env.LOCKOUT_ALL_KEYS && process.env.LOCKOUT_ALL_KEYS !== 'false',
    DISALLOWED_METHODS: !!process.env.DISALLOWED_METHODS
      ? envToArray(process.env.DISALLOWED_METHODS.toUpperCase())
      : [],
    REQUESTS_PER_CONTRIVED_ERROR: Number(process.env.REQUESTS_PER_CONTRIVED_ERROR),
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
    PRUNE_DATA_MAX_USERS: !!process.env.PRUNE_DATA_MAX_USERS
      ? Number(process.env.PRUNE_DATA_MAX_USERS)
      : null,
    PRUNE_DATA_MAX_MEMES: !!process.env.PRUNE_DATA_MAX_MEMES
      ? Number(process.env.PRUNE_DATA_MAX_MEMES)
      : null,
    PRUNE_DATA_MAX_UPLOADS: !!process.env.PRUNE_DATA_MAX_UPLOADS
      ? Number(process.env.PRUNE_DATA_MAX_UPLOADS)
      : null,
    INIT_DATA_USERS: !!process.env.INIT_DATA_USERS
      ? Number(process.env.INIT_DATA_USERS)
      : null,
    INIT_DATA_USER_MEMES: !!process.env.INIT_DATA_USER_MEMES
      ? Number(process.env.INIT_DATA_USER_MEMES)
      : null,
    INIT_DATA_USER_MAX_FRIENDS: !!process.env.INIT_DATA_USER_MAX_FRIENDS
      ? Number(process.env.INIT_DATA_USER_MAX_FRIENDS)
      : null,
    INIT_DATA_USER_MAX_REQUESTS: !!process.env.INIT_DATA_USER_MAX_REQUESTS
      ? Number(process.env.INIT_DATA_USER_MAX_REQUESTS)
      : null,
    INIT_DATA_USER_MAX_CHATS: !!process.env.INIT_DATA_USER_MAX_CHATS
      ? Number(process.env.INIT_DATA_USER_MAX_CHATS)
      : null,
    INIT_DATA_USER_MAX_COMMENTS: !!process.env.INIT_DATA_USER_MAX_COMMENTS
      ? Number(process.env.INIT_DATA_USER_MAX_COMMENTS)
      : null,
    INIT_DATA_START_MINS_AGO: !!process.env.INIT_DATA_START_MINS_AGO
      ? Number(process.env.INIT_DATA_START_MINS_AGO)
      : null,
    HYDRATE_DB_ON_STARTUP:
      !!process.env.HYDRATE_DB_ON_STARTUP &&
      process.env.HYDRATE_DB_ON_STARTUP !== 'false',
    API_ROOT_URI: process.env.API_ROOT_URI || '',
    IMGUR_ALBUM_HASH: process.env.IMGUR_ALBUM_HASH || '',
    IMGUR_CLIENT_ID: process.env.IMGUR_CLIENT_ID || '',
    DEBUG: process.env.DEBUG ?? null,
    DEBUG_INSPECTING: !!process.env.VSCODE_INSPECTOR_OPTIONS,
    VERCEL_REGION: (process.env.VERCEL_REGION || 'unknown').toString(),
    TZ: (process.env.TZ || 'unknown').toString().replace(':', ''),
    VERCEL_GIT_COMMIT_MESSAGE: (
      process.env.VERCEL_GIT_COMMIT_MESSAGE || 'unknown'
    ).toString()
  };

  debug(env);

  // ? Typescript troubles
  const NODE_X: string = env.NODE_ENV;
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

  if (NODE_X == 'unknown') errors.push(`bad NODE_ENV, saw "${NODE_X}"`);

  // TODO: expect-env should cover this use-case (server-only) as well
  if (isServer()) {
    if (env.MONGODB_URI === '') errors.push(`bad MONGODB_URI, saw "${env.MONGODB_URI}"`);

    (
      [
        'RESULTS_PER_PAGE',
        'REQUESTS_PER_CONTRIVED_ERROR',
        'MAX_CONTENT_LENGTH_BYTES'
      ] as (keyof typeof env)[]
    ).forEach((name) => envIsGtZero(name));

    env.DISALLOWED_METHODS.forEach(
      (method) =>
        !HTTP2_METHODS.includes(method) &&
        errors.push(
          `unknown method "${method}", must be one of: ${HTTP2_METHODS.join(', ')}`
        )
    );

    if (env.MONGODB_MS_PORT && env.MONGODB_MS_PORT <= 1024) {
      errors.push(`optional environment variable MONGODB_MS_PORT must be > 1024`);
    }

    if (!env.IMGUR_ALBUM_HASH || !env.IMGUR_CLIENT_ID) {
      errors.push('IMGUR_ALBUM_HASH and IMGUR_CLIENT_ID must be defined');
    }
  }

  if (errors.length) {
    throw new IllegalEnvironmentError(
      `illegal environment detected:\n - ${errors.join('\n - ')}`
    );
  } else return env;
}
