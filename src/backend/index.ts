/**
 * This token is guaranteed never to appear in dummy data generated during
 * tests. In production, this token can be used to represent a `null` or
 * non-existent token. This token cannot be used for authenticated HTTP access
 * to the API.
 */
export const NULL_TOKEN = '00000000-0000-0000-0000-000000000000';

/**
 * This token is used by database initialization and activity simulation
 * scripts. This token cannot be used for authenticated HTTP access to the API.
 */
export const MACHINE_TOKEN = '11111111-1111-1111-1111-111111111111';

/**
 * This token allows authenticated API access only when running in a test
 * environment (i.e. `NODE_ENV=test`). This token cannot be used for
 * authenticated HTTP access to the API in production.
 */
export const DUMMY_TOKEN = '12349b61-83a7-4036-b060-213784b491';

/**
 * This token is guaranteed to be rate limited when running in a test
 * environment (i.e. `NODE_ENV=test`). This token cannot be used for
 * authenticated HTTP access to the API in production.
 */
export const BANNED_TOKEN = 'banned-h54e-6rt7-gctfh-hrftdygct0';

/**
 * This token can be used to authenticate with local and non-production
 * deployments. This token cannot be used for authenticated HTTP access to the
 * API in production.
 */
export const DEV_TOKEN = 'dev-xunn-dev-294a-536h-9751-rydmj';

/**
 * All valid HTTP2 methods.
 */
export const validHttpMethods = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'CONNECT',
  'OPTIONS',
  'TRACE',
  'PATCH'
] as const;

export type ValidHttpMethod = typeof validHttpMethods[number];
