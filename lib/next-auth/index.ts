import { getEnv } from 'multiverse/next-env';
import { getDb } from 'multiverse/mongo-schema';
import { toss } from 'toss-expression';
import { isError } from '@xunnamius/types';
import { debugFactory } from 'multiverse/debug-extended';
import { randomUUID as generateUUID } from 'node:crypto';

import {
  AppValidationError,
  GuruMeditationError,
  InvalidAppConfigurationError,
  InvalidSecretError
} from 'universe/error';

import { MongoServerError, WithId, WithoutId } from 'mongodb';
import type { Merge } from 'type-fest';

// TODO: consider breaking this into multiple different files (and tests) when
// TODO: turned into a standalone package. Also, multiple debug identifiers.

const debug = debugFactory('next-auth:index');

// * Well-known tokens

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
 * This string can be used to authenticate with local and _non-web-facing_ test
 * and preview deployments as a global administrator. This string cannot be used
 * for authenticated HTTP access to the API in production.
 */
export const DEV_BEARER_TOKEN = 'dev-xunn-dev-294a-536h-9751-rydmj';

// * Well-known authentication (Authorization header) schemes and attributes

/**
 * An array of supported authentication schemes.
 */
// ! Must be lowercase alphanumeric (enforced by unit tests)
export const authSchemes = ['bearer'] as const;

/**
 * An array of allowed "auth" entry attributes. Each array element must
 * correspond to a field in the {@link TokenAttributes} type and vice-versa.
 */
export const authAttributes = ['owner', 'isGlobalAdmin'] as const;

/**
 * A supported authentication scheme.
 */
export type AuthScheme = typeof authSchemes[number];

/**
 * A supported "auth" entry attribute (field name).
 */
export type AuthAttribute = typeof authAttributes[number];

// * Well-known authorization (Authorization header) constraints

/**
 * An array of supported authorization constraints.
 */
export const authConstraints = [
  /**
   * This constraint ensures that only "auth" entries that have the
   * `globalAdmin` field set to `true` are successfully authenticated.
   */
  'isGlobalAdmin'
] as const;

/**
 * A supported authorization constraint.
 */
export type AuthConstraint = typeof authConstraints[number];

// * Base token interfaces

/**
 * The shape of a token and scheme data that might be contained within an entry
 * in the well-known "auth" collection.
 */
export type TargetToken = Partial<{
  /**
   * The authentication scheme of the target token.
   */
  scheme: string;
  /**
   * The target token.
   */
  token: Record<string, unknown>;
}>;

/**
 * The shape of the actual token and scheme data contained within an entry in
 * the well-known "auth" collection.
 */
export type Token = {
  /**
   * The authentication scheme this token supports.
   */
  scheme: AuthScheme;
  /**
   * The actual token.
   */
  token: Record<string, unknown>;
};

/**
 * The shape of the attributes associated with an entry in the well-known "auth"
 * collection. Each property must correspond to an array element in the
 * {@link authAttributes} array and vice-versa.
 */
// ! `owner` must be the only required property. All others must be optional.
export type TokenAttributes = {
  /**
   * A string (or stringified ObjectId) representing the owner of the token.
   */
  owner: string;
  /**
   * If `true`, the token grants access to potentially dangerous abilities via
   * the well-known "/sys" API endpoint.
   *
   * @default undefined
   */
  isGlobalAdmin?: boolean;
};

/**
 * The base shape of an entry in the well-known "auth" collection. **More
 * complex entry types must extend from or intersect with this base type.**
 */
export type InternalAuthEntry = WithId<
  {
    /**
     * Metadata attributes associated with this "auth" entry.
     */
    attributes: TokenAttributes;
  } & Token
>;

/**
 * The base shape of a new entry in the well-known "auth" collection. More
 * complex entry types may or may not extend from or intersect with this type.
 *
 * Each API has the latitude to generate a token using whichever available
 * scheme is most convenient. Hence, the only external data necessary to create
 * a new auth entry is `attributes`.
 */
export type NewAuthEntry = Pick<InternalAuthEntry, 'attributes'>;

/**
 * The public base shape derived from an entry in the well-known "auth"
 * collection.
 */
export type PublicAuthEntry = WithoutId<InternalAuthEntry>;

// * Bearer token interfaces

/**
 * The shape of a bearer token object.
 */
export type BearerToken = {
  /**
   * The authentication scheme this token supports.
   */
  scheme: 'bearer';
  /**
   * The bearer token.
   */
  token: {
    bearer: string;
  };
};

/**
 * The shape of a bearer token entry in the well-known "auth" collection.
 */
export type InternalAuthBearerEntry = Merge<InternalAuthEntry, BearerToken>;

// * Type guards

/**
 * Type guard that returns `true` if `obj` satisfies the {@link AuthScheme}
 * interface. Additional constraints may be enforced such that `obj` is among a
 * _subset_ of allowable schemes via the `onlyAllowSubset` parameter.
 */
export function isAllowedScheme(
  obj: unknown,
  onlyAllowSubset?: AuthScheme | AuthScheme[]
): obj is AuthScheme {
  return !![onlyAllowSubset || authSchemes].flat().includes(obj as AuthScheme);
}

/**
 * Type guard that returns `true` if `obj` satisfies the {@link TokenAttributes}
 * interface.
 */
export function isTokenAttributes(
  obj: unknown,
  { patch }: { patch: boolean } = { patch: false }
): obj is TokenAttributes {
  const attr = obj as TokenAttributes;
  if (!!attr && typeof attr == 'object') {
    const isValidOwner = !!attr.owner && typeof attr.owner == 'string';
    const isValidGlobalAdmin =
      attr.isGlobalAdmin === undefined || typeof attr.isGlobalAdmin == 'boolean';
    const allKeysAreValid = Object.keys(attr).every((key) =>
      authAttributes.includes(key as AuthAttribute)
    );

    if (allKeysAreValid) {
      if (patch) {
        return (attr.owner === undefined || isValidOwner) && isValidGlobalAdmin;
      } else {
        return isValidOwner && isValidGlobalAdmin;
      }
    }
  }

  return false;
}

/**
 * Type guard that returns `true` if `obj` satisfies the {@link NewAuthEntry}
 * interface.
 */
export function isNewAuthEntry(obj: unknown): obj is NewAuthEntry {
  const entry = obj as NewAuthEntry;
  return isTokenAttributes(entry?.attributes);
}

// * Token utilities

/**
 * Derives a token and scheme from an authentication string (such as an
 * Authorization header). **Does not check the database for token existence**.
 * Throws on invalid/missing authentication string.
 */
export async function deriveSchemeAndToken({
  authString,
  allowedSchemes
}: {
  /**
   * The authentication string used to derive a token and scheme.
   */
  authString?: string | undefined;
  /**
   * Accepted authentication schemes. By default, all schemes are accepted.
   */
  allowedSchemes?: AuthScheme | AuthScheme[];
}): Promise<BearerToken /* | OtherToken */>;
/**
 * Derives a token and scheme from authentication data. Throws on
 * invalid/missing authentication data.
 */
export async function deriveSchemeAndToken({
  authData,
  allowedSchemes
}: {
  /**
   * The data used to derive a token and scheme.
   */
  authData?: TargetToken;
  /**
   * Accepted authentication schemes. By default, all schemes are accepted.
   */
  allowedSchemes?: AuthScheme | AuthScheme[];
}): Promise<BearerToken /* | OtherToken */>;
export async function deriveSchemeAndToken({
  authString,
  authData,
  allowedSchemes
}: {
  /**
   * The authentication string used to derive a token and scheme.
   */
  authString?: string | undefined;
  /**
   * The parameters used to derive a token and scheme.
   */
  authData?: TargetToken;
  /**
   * Accepted authentication schemes. By default, all schemes are accepted.
   */
  allowedSchemes?: AuthScheme | AuthScheme[];
}): Promise<BearerToken /* | OtherToken */> {
  if (authString !== undefined) {
    if (
      !authString ||
      typeof authString != 'string' ||
      !/^\S+ \S/.test(authString) ||
      authString.length > getEnv().AUTH_HEADER_MAX_LENGTH
    ) {
      throw new InvalidSecretError('auth string');
    }

    let scheme: AuthScheme;
    const [rawScheme, ...rawCredentials] = authString.split(/\s/gi);
    const maybeScheme = rawScheme.toLowerCase();

    debug(`deriving token of scheme "${maybeScheme}" from auth string`);

    if (isAllowedScheme(maybeScheme, allowedSchemes)) {
      scheme = maybeScheme;
    } else {
      throw new InvalidSecretError('scheme (disallowed or unknown)');
    }

    const credentials = rawCredentials.flatMap((c) => c.split(',')).filter(Boolean);

    if (scheme == 'bearer') {
      if (credentials.length == 1) {
        return { scheme, token: { bearer: credentials[0] } };
      } else {
        throw new InvalidSecretError('token syntax');
      }
    } /*else if(scheme == '...') {
      ...
    }*/ else {
      throw new GuruMeditationError(
        `auth string handler for scheme "${scheme}" is not implemented`
      );
    }
  } else if (authData !== undefined) {
    if (!authData || typeof authData != 'object') {
      throw new InvalidSecretError('auth data');
    }

    let scheme: AuthScheme;
    const maybeScheme = authData.scheme?.toLowerCase();

    debug(`deriving token of scheme "${maybeScheme}" from auth data`);

    if (isAllowedScheme(maybeScheme, allowedSchemes)) {
      scheme = maybeScheme;
    } else {
      throw new InvalidSecretError('scheme (disallowed or unknown)');
    }

    if (scheme == 'bearer') {
      if (
        authData.token &&
        typeof authData.token == 'object' &&
        Object.keys(authData.token).length == 1 &&
        authData.token.bearer &&
        typeof authData.token.bearer == 'string'
      ) {
        return { scheme, token: { bearer: authData.token.bearer } };
      } else {
        throw new InvalidSecretError('token syntax');
      }
    } /*else if(scheme == '...') {
      ...
    }*/ else {
      throw new GuruMeditationError(
        `auth data handler for scheme "${scheme}" is not implemented`
      );
    }
  } else {
    throw new InvalidSecretError('invocation');
  }
}

/**
 * Transform an internal entry from the well-known "auth" MongoDB collection
 * into one that is safe for public consumption.
 */
export function toPublicAuthEntry(entry: InternalAuthEntry): PublicAuthEntry {
  const { _id, ...publicEntry } = entry;
  return publicEntry;
}

// * Authorization header checks

/**
 * Authenticates a client via their Authorization header using the well-known
 * "auth" MongoDB collection. Does not throw on invalid/missing header string.
 *
 * Despite the unfortunate name of the "Authorization" header, this function is
 * only used for authentication, not authorization.
 */
export async function authenticateHeader({
  header,
  allowedSchemes
}: {
  /**
   * Contents of the HTTP Authorization header.
   */
  header: string | undefined;
  /**
   * Accepted authentication schemes. By default, all schemes are accepted.
   */
  allowedSchemes?: AuthScheme | AuthScheme[];
}): Promise<{ authenticated: boolean; error?: unknown }> {
  let scheme: Awaited<ReturnType<typeof deriveSchemeAndToken>>['scheme'];
  let token: Awaited<ReturnType<typeof deriveSchemeAndToken>>['token'];

  try {
    ({ scheme, token } = await deriveSchemeAndToken({
      authString: header,
      allowedSchemes
    }));
  } catch (e) {
    return {
      authenticated: false,
      error: `bad Authorization header: ${
        isError(e) ? e.message : /* istanbul ignore next */ e
      }`
    };
  }

  return {
    authenticated: await (
      await getDb({ name: 'root' })
    )
      .collection<InternalAuthEntry>('auth')
      // ? To hit the index, order matters
      .findOne({ scheme, token })
      .then((r) => !!r)
  };
}

/**
 * Authorizes a client via their Authorization header using the well-known
 * "auth" MongoDB collection. Does not throw on invalid/missing header string.
 */
export async function authorizeHeader({
  header,
  constraints
}: {
  /**
   * Contents of the HTTP Authorization header.
   */
  header: string | undefined;
  /**
   * Constraints a client must satisfy to be considered authorized.
   */
  constraints?: AuthConstraint | AuthConstraint[];
}): Promise<{ authorized: boolean; error?: unknown }> {
  let attributes: Awaited<ReturnType<typeof getAttributes>>;

  try {
    attributes = await getAttributes({
      target: await deriveSchemeAndToken({ authString: header })
    });
  } catch (e) {
    return {
      authorized: false,
      error: `bad Authorization header: ${
        isError(e) ? e.message : /* istanbul ignore next */ e
      }`
    };
  }

  if (
    typeof constraints != 'string' &&
    (!Array.isArray(constraints) || !constraints.length)
  ) {
    debug.warn('header authorization was vacuous (no constraints)');
  } else {
    const constraintsArray = [constraints].flat();
    const finalConstraints = Array.from(new Set(constraintsArray));

    if (finalConstraints.length != constraintsArray.length) {
      throw new InvalidAppConfigurationError(
        'encountered duplicate authorization constraints'
      );
    } else {
      try {
        await Promise.all(
          finalConstraints.map(async (constraint) => {
            debug(`evaluating authorization constraint "${constraint}"`);

            const failAuthorization = () => {
              throw `failed to satisfy authorization constraint "${constraint}"`;
            };

            if (constraint == 'isGlobalAdmin') {
              if (!attributes.isGlobalAdmin) {
                failAuthorization();
              }
            } /*else if(constraint == '...') {
              ...
            }*/ else {
              throw new InvalidAppConfigurationError(
                `encountered unknown or unhandled authorization constraint "${constraint}"`
              );
            }
          })
        );
      } catch (error) {
        if (isError(error)) {
          throw error;
        }

        return { authorized: false, error };
      }
    }
  }

  return { authorized: true };
}

// * MongoDB "auth" collection accessors and mutators

/**
 * Returns an entry's attributes by matching the target data against the
 * well-known "auth" MongoDB collection. Throws on invalid/missing data.
 */
export async function getAttributes<T extends TokenAttributes>({
  target
}: {
  target?: TargetToken;
}): Promise<T> {
  const { scheme, token } = await deriveSchemeAndToken({ authData: target });

  const { attributes } =
    (await (await getDb({ name: 'root' }))
      .collection<InternalAuthEntry>('auth')
      .findOne<{ attributes: T }>(
        // ? To hit the index, order matters
        { scheme, token },
        { projection: { _id: false, attributes: true } }
      )) || toss(new InvalidSecretError('authentication scheme and token combination'));

  return attributes;
}

/**
 * Updates an entry's attributes by matching the provided data against the
 * well-known "auth" MongoDB collection. Throws on invalid/missing target or
 * entry data.
 *
 * **Note that the new `attributes` object will _patch_, not replace, the old
 * object.**
 */
export async function updateAttributes({
  target,
  attributes
}: {
  /**
   * The target `token` and its `scheme` whose attributes will be updated.
   */
  target?: TargetToken;
  /**
   * The updated attributes
   */
  attributes?: Partial<TokenAttributes>;
}): Promise<void> {
  const { scheme, token } = await deriveSchemeAndToken({ authData: target });

  if (isTokenAttributes(attributes, { patch: true })) {
    if (Object.keys(attributes).length) {
      const result = await (await getDb({ name: 'root' }))
        .collection<InternalAuthEntry>('auth')
        .updateOne(
          // ? To hit the index, order matters
          { scheme, token },
          // * Aggregation pipeline: https://stackoverflow.com/a/56604200/1367414
          [{ $addFields: { attributes } }]
        );

      if (result.matchedCount != 1) {
        throw new InvalidSecretError('authentication scheme and token combination');
      }
    }
  } else {
    throw new InvalidSecretError('attributes');
  }
}

/**
 * Returns all entries with a matching `owner` attribute in the well-known
 * "auth" MongoDB collection. Throws on invalid/missing `owner` attribute.
 */
export async function getOwnerEntries({
  owner
}: {
  /**
   * A valid token `owner`.
   *
   * @see {@link TokenAttributes}
   */
  owner?: TokenAttributes['owner'];
}): Promise<PublicAuthEntry[]> {
  if (owner === undefined || isTokenAttributes({ owner })) {
    return (await getDb({ name: 'root' }))
      .collection<InternalAuthEntry>('auth')
      .find<PublicAuthEntry>(
        // * Query is covered by the index
        owner ? { 'attributes.owner': owner } : {},
        { projection: { _id: false } }
      )
      .toArray();
  } else {
    throw new InvalidSecretError('owner');
  }
}

/**
 * Generates a new entry in the well-known "auth" MongoDB collection, including
 * the provided attribute metadata (if any). Throws on invalid entry data.
 *
 * The current version of this function uses the `bearer` scheme to create v4
 * UUID "bearer tokens". This _implementation detail_ may change at any time.
 */
export async function createEntry({
  entry
}: {
  /**
   * Data used to generate a new "auth" entry.
   */
  entry?: Partial<NewAuthEntry>;
}): Promise<PublicAuthEntry> {
  if (isNewAuthEntry(entry)) {
    const newEntry: WithoutId<InternalAuthBearerEntry> = {
      attributes: entry.attributes,
      scheme: 'bearer',
      // ! Due to how MongoDB works, it is EXTREMELY important that new entries'
      // ! token object properties are ALWAYS in an consistent, expected order.
      // ! This only matters when entry.token has more than one property.
      token: { bearer: generateUUID() }
    };

    try {
      await (await getDb({ name: 'root' })).collection('auth').insertOne({ ...newEntry });
    } catch (e) {
      /* istanbul ignore else */
      if (e instanceof MongoServerError && e.code == 11000) {
        throw new AppValidationError('token collision');
      } else {
        throw e;
      }
    }
    return newEntry;
  } else {
    throw new InvalidSecretError('entry data');
  }
}

/**
 * Deletes an entry in the well-known "auth" MongoDB collection by matching
 * against the target data. Throws on invalid/missing target data.
 */
export async function deleteEntry({
  target
}: {
  /**
   * The target `token` and its `scheme` to delete.
   */
  target?: TargetToken;
}): Promise<void> {
  const { scheme, token } = await deriveSchemeAndToken({ authData: target });

  const result = await (await getDb({ name: 'root' }))
    .collection<InternalAuthEntry>('auth')
    .deleteOne(
      // ? To hit the index, order matters
      { scheme, token }
    );

  if (result.deletedCount != 1) {
    throw new InvalidSecretError('authentication scheme and token combination');
  }
}
