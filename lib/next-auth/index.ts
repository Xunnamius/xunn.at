import { GuruMeditationError, InvalidSecretError } from 'named-app-errors';
import { getEnv } from 'multiverse/next-env';
import { getDb } from 'multiverse/mongo-schema';

/**
 * This string is guaranteed never to appear in data generated during tests or
 * in production. Hence, this string can be used to represent a `null` or
 * non-existent token. This string cannot be used for authenticated HTTP access
 * to the API.
 */
export const NULL_BEARER_TOKEN = '00000000-0000-0000-0000-000000000000';

/**
 * This string allows authenticated API access only when running in a test
 * environment (i.e. `NODE_ENV=test`). This string cannot be used for
 * authenticated HTTP access to the API in production.
 */
export const DUMMY_BEARER_TOKEN = '12349b61-83a7-4036-b060-213784b491';

/**
 * This string is guaranteed to be rate limited when running in a test
 * environment (i.e. `NODE_ENV=test`). This string cannot be used for
 * authenticated HTTP access to the API in production.
 */
export const BANNED_BEARER_TOKEN = 'banned-h54e-6rt7-gctfh-hrftdygct0';

/**
 * This string can be used to authenticate with local and non-production
 * deployments. This string cannot be used for authenticated HTTP access to the
 * API in production.
 */
export const DEV_BEARER_TOKEN = 'dev-xunn-dev-294a-536h-9751-rydmj';

/**
 * The shape of a basic credentials entry in the well-known "auth" collection.
 * **More complex credential types must extend from this base type.**
 */
export type InternalAuthEntry = {
  owner: { name: string };
  scheme: string;
  token: Record<string, unknown>;
};

/**
 * The shape of a bearer token entry in the well-known "auth" collection.
 */
export interface InternalAuthBearerEntry extends InternalAuthEntry {
  scheme: 'bearer';
  token: {
    bearer: string;
  };
}

/**
 * An array of supported HTTP Authorization header schemes.
 */
export const authSchemes = ['bearer'] as const;

/**
 * Supported HTTP Authorization header schemes.
 */
export type AuthScheme = typeof authSchemes[number];

/**
 * Derives a token from the Authorization header using the well-known "auth"
 * MongoDB collection.
 */
export async function getToken({
  header,
  allowedSchemes
}: {
  header: string | undefined;
  allowedSchemes?: AuthScheme | AuthScheme[];
}) {
  if (
    !header ||
    typeof header != 'string' ||
    !/^\S+ \S/.test(header) ||
    header.length > getEnv().AUTH_HEADER_MAX_LENGTH
  ) {
    throw new InvalidSecretError('HTTP Authorization header');
  }

  const [rawScheme, ...rawCredentials] = header.split(/\s/gi);
  const scheme = rawScheme.toLowerCase();

  allowedSchemes = [allowedSchemes || 'bearer']
    .flat()
    .map((s) => s.toLowerCase() as typeof s);

  const isAllowedScheme = (s: string): s is AuthScheme => {
    return !!allowedSchemes?.includes(s as AuthScheme);
  };

  if (!isAllowedScheme(scheme)) {
    throw new InvalidSecretError('HTTP Authorization scheme (disallowed or unknown)');
  }

  const credentials = rawCredentials.flatMap((c) => c.split(',')).filter(Boolean);

  /* istanbul ignore else */
  if (scheme == 'bearer') {
    if (credentials.length == 1) {
      return { scheme, token: { bearer: credentials[0] } };
    } else {
      throw new InvalidSecretError('HTTP Authorization parameter(s)');
    }
  }

  // ? TypeScript isn't yet smart enough to figure out that just reaching the
  // ? end of the above if-statements implies scheme *must* be handled. At the
  // ? same time, istanbul isn't smart enough to just ignore the final "else"...
  /* istanbul ignore next */
  throw new GuruMeditationError('"unreachable" code encountered');
}

/**
 * Checks if a token can be derived from the Authorization header using the
 * well-known "auth" MongoDB collection. Does not throw on invalid/missing
 * headers.
 */
export async function isValidAuthHeader({
  header,
  allowedSchemes
}: {
  header: string | undefined;
  allowedSchemes?: AuthScheme | AuthScheme[];
}) {
  let scheme: Awaited<ReturnType<typeof getToken>>['scheme'];
  let token: Awaited<ReturnType<typeof getToken>>['token'];

  try {
    ({ scheme, token } = await getToken({ header, allowedSchemes }));
  } catch (e) {
    return { valid: false, error: e };
  }

  return {
    valid: await (
      await getDb({ name: 'root' })
    )
      .collection<InternalAuthEntry>('auth')
      .findOne({ scheme, token })
      .then((r) => !!r)
  };
}

/**
 * Returns a user identity object derived from the Authorization header via the
 * well-known "auth" and "user" MongoDB collections. Throws on invalid/missing
 * headers.
 */
// export async function getAuthedUser<T extends InternalUser>() {
//
// }
