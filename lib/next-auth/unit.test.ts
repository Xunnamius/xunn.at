import { useMockDateNow, dummyRootData } from 'multiverse/mongo-common';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { getDb } from 'multiverse/mongo-schema';
import { ObjectId } from 'mongodb';
import { asMockedFunction } from '@xunnamius/jest-types';
import { randomUUID } from 'node:crypto';

import {
  BANNED_BEARER_TOKEN,
  DEV_BEARER_TOKEN,
  DUMMY_BEARER_TOKEN,
  NULL_BEARER_TOKEN,
  deriveSchemeAndToken,
  authenticateHeader,
  getAttributes,
  authSchemes,
  authConstraints,
  authorizeHeader,
  updateAttributes,
  isAllowedScheme,
  isTokenAttributes,
  isNewAuthEntry,
  getOwnerEntries,
  deleteEntry,
  createEntry,
  toPublicAuthEntry
} from 'multiverse/next-auth';

import * as NextAuthSpyTarget from 'multiverse/next-auth';

import type {
  AuthScheme,
  AuthAttribute,
  TokenAttributes,
  AuthConstraint,
  TargetToken,
  InternalAuthEntry,
  PublicAuthEntry
} from 'multiverse/next-auth';

import type { WithoutId } from 'mongodb';

setupMemoryServerOverride();
useMockDateNow();

jest.mock('node:crypto');

const mockRandomUUID = asMockedFunction(randomUUID);

const _authSchemes = authSchemes.slice();
const _authConstraints = authConstraints.slice();
const mutableAuthSchemes = authSchemes as unknown as string[];
const mutableAuthConstraints = authConstraints as unknown as string[];

beforeEach(() => {
  mockRandomUUID.mockReturnValue(DUMMY_BEARER_TOKEN);
});

afterEach(() => {
  mutableAuthSchemes.splice(0, mutableAuthSchemes.length, ..._authSchemes);
  mutableAuthConstraints.splice(0, mutableAuthConstraints.length, ..._authConstraints);
});

test('ensure authSchemes contains only lowercase alphanumeric strings', () => {
  expect.hasAssertions();
  const isLowercaseAlphanumeric = /^[a-z0-9]+$/;

  expect(
    authSchemes.every(
      (scheme) => typeof scheme == 'string' && isLowercaseAlphanumeric.test(scheme)
    )
  ).toBeTrue();
});

test("ensure authAttributes forms a bijection on TokenAttributes's fields", () => {
  expect.hasAssertions();

  // ? This is a TypeScript-only "test" where type checking will fail if
  // ? `TokenAttributes` does not match `authAttributes`. While this won't fail
  // ? when run via jest, this will fail the pre-commit hook.
  const x: keyof TokenAttributes = '' as AuthAttribute;
  const y: AuthAttribute = '' as keyof TokenAttributes;
  expect(x).toBe(y);
});

describe('::isAllowedScheme', () => {
  it('returns true only if passed an AuthScheme', async () => {
    expect.hasAssertions();

    expect(isAllowedScheme('bearer')).toBeTrue();
    expect(isAllowedScheme('nope')).toBeFalse();

    mutableAuthSchemes.push('nope');

    expect(isAllowedScheme('nope')).toBeTrue();
  });

  it('returns true only if passed an allowed AuthScheme when using onlyAllowSubset', async () => {
    expect.hasAssertions();

    expect(isAllowedScheme('bearer')).toBeTrue();
    expect(isAllowedScheme('bearer', [])).toBeFalse();
    expect(isAllowedScheme('bearer', ['nope' as AuthScheme])).toBeFalse();
    expect(isAllowedScheme('nope', ['nope' as AuthScheme])).toBeTrue();
    expect(isAllowedScheme('nope', 'nope' as AuthScheme)).toBeTrue();
    expect(isAllowedScheme('nope', 'bearer')).toBeFalse();
  });
});

describe('::isTokenAttributes', () => {
  it('returns true only if passed TokenAttributes', async () => {
    expect.hasAssertions();

    expect(isTokenAttributes(undefined)).toBeFalse();
    expect(isTokenAttributes(null)).toBeFalse();
    expect(isTokenAttributes(1)).toBeFalse();
    expect(isTokenAttributes('1')).toBeFalse();
    expect(isTokenAttributes({})).toBeFalse();
    expect(isTokenAttributes({ owner: true })).toBeFalse();
    expect(isTokenAttributes({ owner: null })).toBeFalse();
    expect(isTokenAttributes({ owner: '' })).toBeFalse();
    expect(isTokenAttributes({ owner: 'owner', isGlobalAdmin: 1 })).toBeFalse();
    expect(isTokenAttributes({ owner: 'owner', isGlobalAdmin: 'true' })).toBeFalse();

    expect(
      isTokenAttributes({ owner: 'owner', isGlobalAdmin: false, extra: 'prop' })
    ).toBeFalse();

    expect(isTokenAttributes({ owner: 'owner' })).toBeTrue();
    expect(isTokenAttributes({ owner: 'owner', isGlobalAdmin: false })).toBeTrue();
    expect(isTokenAttributes({ isGlobalAdmin: false })).toBeFalse();
  });

  it('returns true if passed partial TokenAttributes in patch mode', async () => {
    expect.hasAssertions();

    expect(isTokenAttributes(undefined, { patch: true })).toBeFalse();
    expect(isTokenAttributes(null, { patch: true })).toBeFalse();
    expect(isTokenAttributes(1, { patch: true })).toBeFalse();
    expect(isTokenAttributes('1', { patch: true })).toBeFalse();
    expect(isTokenAttributes({}, { patch: true })).toBeTrue();
    expect(isTokenAttributes({ owner: true }, { patch: true })).toBeFalse();
    expect(isTokenAttributes({ owner: null }, { patch: true })).toBeFalse();
    expect(isTokenAttributes({ owner: '' })).toBeFalse();

    expect(
      isTokenAttributes({ owner: 'owner', isGlobalAdmin: 1 }, { patch: true })
    ).toBeFalse();

    expect(
      isTokenAttributes({ owner: 'owner', isGlobalAdmin: 'true' }, { patch: true })
    ).toBeFalse();

    expect(
      isTokenAttributes({ owner: 'owner', isGlobalAdmin: false, extra: 'prop' })
    ).toBeFalse();

    expect(isTokenAttributes({ owner: 'owner' }, { patch: true })).toBeTrue();

    expect(
      isTokenAttributes({ owner: 'owner', isGlobalAdmin: false }, { patch: true })
    ).toBeTrue();

    expect(isTokenAttributes({ isGlobalAdmin: false }, { patch: true })).toBeTrue();
  });
});

describe('::isNewAuthEntry', () => {
  it('returns true only if passed a NewAuthEntry', async () => {
    expect.hasAssertions();

    expect(isNewAuthEntry(undefined)).toBeFalse();
    expect(isNewAuthEntry(null)).toBeFalse();
    expect(isNewAuthEntry(1)).toBeFalse();
    expect(isNewAuthEntry('1')).toBeFalse();
    expect(isNewAuthEntry({})).toBeFalse();
    expect(isNewAuthEntry({ attributes: undefined })).toBeFalse();
    expect(isNewAuthEntry({ attributes: null })).toBeFalse();
    expect(isNewAuthEntry({ attributes: { owner: true } })).toBeFalse();
    expect(isNewAuthEntry({ attributes: { owner: null } })).toBeFalse();

    expect(
      isNewAuthEntry({ attributes: { owner: 'owner', isGlobalAdmin: 1 } })
    ).toBeFalse();

    expect(
      isNewAuthEntry({ attributes: { owner: 'owner', isGlobalAdmin: 'true' } })
    ).toBeFalse();

    expect(
      isNewAuthEntry({
        attributes: { owner: 'owner', isGlobalAdmin: false, extra: 'prop' }
      })
    ).toBeFalse();

    expect(
      isNewAuthEntry({ attributes: { owner: 'owner', isGlobalAdmin: false } })
    ).toBeTrue();

    expect(isNewAuthEntry({ attributes: { owner: 'owner' } })).toBeTrue();
  });
});

describe('::deriveSchemeAndToken', () => {
  it('handles schemes case-insensitively', async () => {
    expect.hasAssertions();

    const expected1 = await deriveSchemeAndToken({ authString: 'bearer 123' });

    await expect(
      deriveSchemeAndToken({ authString: 'bEaReR 123' })
    ).resolves.toStrictEqual(expected1);

    await expect(
      deriveSchemeAndToken({ authString: 'BeaRer 123' })
    ).resolves.toStrictEqual(expected1);

    await expect(
      deriveSchemeAndToken({ authString: 'BEARER 123' })
    ).resolves.toStrictEqual(expected1);

    const expected2 = await deriveSchemeAndToken({
      authData: { scheme: 'bearer', token: { bearer: '123' } }
    });

    await expect(
      deriveSchemeAndToken({
        authData: { scheme: 'bearer', token: { bearer: '123' } }
      })
    ).resolves.toStrictEqual(expected2);

    await expect(
      deriveSchemeAndToken({
        authData: { scheme: 'bearer', token: { bearer: '123' } }
      })
    ).resolves.toStrictEqual(expected2);

    await expect(
      deriveSchemeAndToken({
        authData: { scheme: 'bearer', token: { bearer: '123' } }
      })
    ).resolves.toStrictEqual(expected2);
  });

  it('handles bearer scheme with token', async () => {
    expect.hasAssertions();

    await expect(
      deriveSchemeAndToken({ authString: 'bearer abc-123' })
    ).resolves.toStrictEqual({
      scheme: 'bearer',
      token: { bearer: 'abc-123' }
    });

    await expect(
      deriveSchemeAndToken({
        authData: { scheme: 'bearer', token: { bearer: 'abc-123' } }
      })
    ).resolves.toStrictEqual({
      scheme: 'bearer',
      token: { bearer: 'abc-123' }
    });
  });

  it('handles allowedSchemes as an AuthScheme or an array of AuthSchemes', async () => {
    expect.hasAssertions();

    await expect(
      deriveSchemeAndToken({ authString: 'bearer abc-123', allowedSchemes: 'bearer' })
    ).resolves.toStrictEqual({
      scheme: 'bearer',
      token: { bearer: 'abc-123' }
    });

    await expect(
      deriveSchemeAndToken({
        authData: {
          scheme: 'bearer',
          token: { bearer: 'abc-123' }
        },
        allowedSchemes: ['bearer']
      })
    ).resolves.toStrictEqual({
      scheme: 'bearer',
      token: { bearer: 'abc-123' }
    });

    // ? Unlike with authorizeHeader and its constraints, duplicate AuthSchemes
    // ? are not a big deal here and so are not checked against.
    await expect(
      deriveSchemeAndToken({
        authData: {
          scheme: 'bearer',
          token: { bearer: 'abc-123' }
        },
        allowedSchemes: ['bearer', 'bearer']
      })
    ).resolves.toStrictEqual({
      scheme: 'bearer',
      token: { bearer: 'abc-123' }
    });
  });

  it('rejects bearer scheme with multipart token', async () => {
    expect.hasAssertions();

    await expect(
      deriveSchemeAndToken({
        authString: 'bearer abc-123,\ndef-234,ghi-345,\n\njkl-456,mno-567'
      })
    ).rejects.toThrow('invalid token syntax');

    await expect(
      deriveSchemeAndToken({
        authData: {
          scheme: 'bearer',
          token: { bearer: ['abc-123', 'def-234', 'ghi-345', 'jkl-456', 'mno-567'] }
        }
      })
    ).rejects.toThrow('invalid token syntax');
  });

  it('rejects on missing and null data', async () => {
    expect.hasAssertions();

    await expect(deriveSchemeAndToken({ authString: '' })).rejects.toThrow(
      'invalid auth string'
    );

    await expect(deriveSchemeAndToken({ authString: undefined })).rejects.toThrow(
      'invalid invocation'
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(deriveSchemeAndToken({ authString: null as any })).rejects.toThrow(
      'invalid auth string'
    );

    await expect(
      deriveSchemeAndToken({ authData: { scheme: 'bearer', token: { bearer: '' } } })
    ).rejects.toThrow('invalid token syntax');

    await expect(
      deriveSchemeAndToken({ authData: { scheme: 'bearer', token: { bearer: '' } } })
    ).rejects.toThrow('invalid token syntax');

    await expect(
      deriveSchemeAndToken({ authData: { scheme: '', token: { bearer: 'abc-123' } } })
    ).rejects.toThrow('invalid scheme (disallowed or unknown)');

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deriveSchemeAndToken({ authData: { something: 'else' } as any })
    ).rejects.toThrow('invalid scheme (disallowed or unknown)');

    await expect(deriveSchemeAndToken({ authData: undefined })).rejects.toThrow(
      'invalid invocation'
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(deriveSchemeAndToken({ authData: null as any })).rejects.toThrow(
      'invalid auth data'
    );
  });

  it('rejects on badly formatted headers', async () => {
    expect.hasAssertions();

    await expect(deriveSchemeAndToken({ authString: 'bearer' })).rejects.toThrow(
      'invalid auth string'
    );

    await expect(deriveSchemeAndToken({ authString: 'bearer-bearer' })).rejects.toThrow(
      'invalid auth string'
    );
  });

  it('rejects on unknown schemes', async () => {
    expect.hasAssertions();

    await expect(
      deriveSchemeAndToken({ authString: 'unknown xyz', allowedSchemes: 'bearer' })
    ).rejects.toThrow('invalid scheme (disallowed or unknown)');

    await expect(
      deriveSchemeAndToken({
        authData: { scheme: 'unknown', token: { bearer: 'xyz' } },
        allowedSchemes: 'bearer'
      })
    ).rejects.toThrow('invalid scheme (disallowed or unknown)');
  });

  it('rejects if using a disallowed scheme', async () => {
    expect.hasAssertions();

    await expect(
      deriveSchemeAndToken({
        authString: 'bearer 123',
        allowedSchemes: ['none' as unknown as AuthScheme]
      })
    ).rejects.toThrow('invalid scheme (disallowed or unknown)');

    await expect(
      deriveSchemeAndToken({
        authData: { scheme: 'bearer', token: { bearer: '123' } },
        allowedSchemes: 'none' as unknown as AuthScheme
      })
    ).rejects.toThrow('invalid scheme (disallowed or unknown)');
  });

  it('rejects if handler for scheme is mistakenly unimplemented', async () => {
    expect.hasAssertions();

    mutableAuthSchemes.push('none');

    await expect(deriveSchemeAndToken({ authString: 'none 123' })).rejects.toThrow(
      'auth string handler for scheme "none" is not implemented'
    );

    await expect(
      deriveSchemeAndToken({ authData: { scheme: 'none', token: { bearer: '123' } } })
    ).rejects.toThrow('auth data handler for scheme "none" is not implemented');
  });
});

describe('::authenticateHeader', () => {
  it('returns an authenticated response if bearer token exists in database', async () => {
    expect.hasAssertions();

    await expect(
      authenticateHeader({
        header: `bearer ${DUMMY_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({ authenticated: true });

    await expect(
      authenticateHeader({
        header: `BEARER ${DEV_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({ authenticated: true });
  });

  // ? Rejecting banned tokens is handled at a different layer than validation
  it('returns an authenticated response even if bearer token is banned', async () => {
    expect.hasAssertions();

    await expect(
      authenticateHeader({
        header: `bearer ${BANNED_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({ authenticated: true });
  });

  it('returns a not-authenticated response if bearer token does not exist in database', async () => {
    expect.hasAssertions();

    await expect(
      authenticateHeader({
        header: `bearer ${NULL_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({ authenticated: false });
  });

  it('returns a not-authenticated response with an "error" prop if using a disallowed scheme', async () => {
    expect.hasAssertions();

    await expect(
      authenticateHeader({
        header: 'bearer 123',
        allowedSchemes: ['none' as unknown as AuthScheme]
      })
    ).resolves.toStrictEqual({
      authenticated: false,
      error: expect.stringContaining('(disallowed or unknown)')
    });
  });
});

describe('::authorizeHeader', () => {
  it('returns a vacuously authorized response if bearer token exists in database', async () => {
    expect.hasAssertions();

    await expect(
      authorizeHeader({
        header: `bearer ${DUMMY_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({ authorized: true });

    await expect(
      authorizeHeader({
        header: `BEARER ${DEV_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({ authorized: true });
  });

  // ? Rejecting banned tokens is handled at a different layer than authorization
  it('returns a vacuously authorized response even if bearer token is banned', async () => {
    expect.hasAssertions();

    await expect(
      authorizeHeader({
        header: `bearer ${BANNED_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({ authorized: true });
  });

  it('returns a vacuously authorized response if passed no constraints', async () => {
    expect.hasAssertions();

    await expect(
      authorizeHeader({
        header: `bearer ${BANNED_BEARER_TOKEN}`,
        constraints: []
      })
    ).resolves.toStrictEqual({ authorized: true });
  });

  it('returns a not-authorized response with an "error" prop if bearer token does not exist in database', async () => {
    expect.hasAssertions();

    await expect(
      authorizeHeader({
        header: `bearer ${NULL_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({
      authorized: false,
      error:
        'bad Authorization header: invalid authentication scheme and token combination'
    });
  });

  it('returns a not-authorized response with an "error" prop only if the isGlobalAdmin constraint fails', async () => {
    expect.hasAssertions();

    await expect(
      authorizeHeader({
        header: `bearer ${BANNED_BEARER_TOKEN}`,
        constraints: 'isGlobalAdmin'
      })
    ).resolves.toStrictEqual({
      authorized: false,
      error: 'failed to satisfy authorization constraint "isGlobalAdmin"'
    });

    await expect(
      authorizeHeader({
        header: `bearer ${DEV_BEARER_TOKEN}`,
        constraints: 'isGlobalAdmin'
      })
    ).resolves.toStrictEqual({
      authorized: true
    });
  });

  it('rejects if duplicate constraints provided', async () => {
    expect.hasAssertions();

    await expect(
      authorizeHeader({
        header: `bearer ${BANNED_BEARER_TOKEN}`,
        constraints: ['isGlobalAdmin', 'isGlobalAdmin']
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('encountered duplicate authorization constraints')
    });
  });

  it('rejects if a non-existent constraint is provided', async () => {
    expect.hasAssertions();

    await expect(
      authorizeHeader({
        header: `bearer ${BANNED_BEARER_TOKEN}`,
        constraints: ['fake-constraint' as AuthConstraint]
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        'encountered unknown or unhandled authorization constraint "fake-constraint"'
      )
    });
  });
});

describe('::getAttributes', () => {
  it('returns attributes if bearer token exists in database', async () => {
    expect.hasAssertions();

    await expect(
      getAttributes({
        target: { scheme: 'bearer', token: { bearer: DUMMY_BEARER_TOKEN } }
      })
    ).resolves.toStrictEqual(dummyRootData.auth[1].attributes);

    await expect(
      getAttributes({
        target: { scheme: 'bearer', token: { bearer: DEV_BEARER_TOKEN } }
      })
    ).resolves.toStrictEqual(dummyRootData.auth[0].attributes);
  });

  // ? Rejecting banned tokens is handled at a different layer than validation
  it('returns attributes even if bearer token is banned', async () => {
    expect.hasAssertions();

    await expect(
      getAttributes({
        target: { scheme: 'bearer', token: { bearer: BANNED_BEARER_TOKEN } }
      })
    ).resolves.toStrictEqual(dummyRootData.auth[2].attributes);
  });

  it('throws if bearer token does not exist in database', async () => {
    expect.hasAssertions();

    await expect(
      getAttributes({
        target: { scheme: 'bearer', token: { bearer: NULL_BEARER_TOKEN } }
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('scheme and token combination')
    });
  });
});

describe('::updateAttributes', () => {
  it('updates (patches) an existing auth entry', async () => {
    expect.hasAssertions();

    const authDb = (await getDb({ name: 'root' })).collection<InternalAuthEntry>('auth');

    await expect(
      updateAttributes({
        target: {
          scheme: 'bearer',
          token: { bearer: dummyRootData.auth[0].token.bearer }
        },
        attributes: { isGlobalAdmin: false }
      })
    ).resolves.toBeUndefined();

    await expect(
      authDb.findOne({ _id: dummyRootData.auth[0]._id })
    ).resolves.toStrictEqual({
      ...dummyRootData.auth[0],
      attributes: { ...dummyRootData.auth[0].attributes, isGlobalAdmin: false }
    });

    await expect(
      updateAttributes({
        target: {
          scheme: 'bearer',
          token: { bearer: dummyRootData.auth[1].token.bearer }
        },
        attributes: { owner: 'name' }
      })
    ).resolves.toBeUndefined();

    await expect(
      authDb.findOne({ _id: dummyRootData.auth[1]._id })
    ).resolves.toStrictEqual({
      ...dummyRootData.auth[1],
      attributes: { ...dummyRootData.auth[1].attributes, owner: 'name' }
    });

    await expect(
      updateAttributes({
        target: {
          scheme: 'bearer',
          token: { bearer: dummyRootData.auth[0].token.bearer }
        },
        attributes: { owner: 'name', isGlobalAdmin: true }
      })
    ).resolves.toBeUndefined();

    await expect(
      authDb.findOne({ _id: dummyRootData.auth[0]._id })
    ).resolves.toStrictEqual({
      ...dummyRootData.auth[0],
      attributes: {
        ...dummyRootData.auth[0].attributes,
        owner: 'name',
        isGlobalAdmin: true
      }
    });

    await expect(
      updateAttributes({
        target: {
          scheme: 'bearer',
          token: { bearer: dummyRootData.auth[1].token.bearer }
        },
        attributes: { isGlobalAdmin: true }
      })
    ).resolves.toBeUndefined();

    await expect(
      authDb.findOne({ _id: dummyRootData.auth[1]._id })
    ).resolves.toStrictEqual({
      ...dummyRootData.auth[1],
      attributes: {
        ...dummyRootData.auth[1].attributes,
        owner: 'name',
        isGlobalAdmin: true
      }
    });
  });

  it('allows empty data (no-op)', async () => {
    expect.hasAssertions();

    await expect(
      updateAttributes({
        target: { scheme: 'bearer', token: { bearer: DEV_BEARER_TOKEN } },
        attributes: {}
      })
    ).resolves.toBeUndefined();
  });

  it('does not reject when demonstrating idempotency', async () => {
    expect.hasAssertions();

    await expect(
      updateAttributes({
        target: { scheme: 'bearer', token: { bearer: DEV_BEARER_TOKEN } },
        attributes: dummyRootData.auth[0].attributes
      })
    ).resolves.toBeUndefined();
  });

  it('rejects if the auth entry is not found', async () => {
    expect.hasAssertions();

    await expect(
      updateAttributes({
        target: { scheme: 'bearer', token: { bearer: NULL_BEARER_TOKEN } },
        attributes: { isGlobalAdmin: false }
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('authentication scheme and token combination')
    });
  });

  it('rejects if passed invalid data', async () => {
    expect.hasAssertions();

    const errors: [
      params: Partial<Parameters<typeof updateAttributes>[0]>,
      error: string
    ][] = [
      [{ target: undefined }, 'invalid invocation'],
      [{ target: null as unknown as TargetToken }, 'invalid auth data'],
      [{ target: false as unknown as TargetToken }, 'invalid auth data'],
      [{ target: true as unknown as TargetToken }, 'invalid auth data'],
      [{ target: {} }, 'invalid scheme'],
      [{ target: { scheme: '' } }, 'invalid scheme'],
      [{ target: { scheme: 'bearer', token: {} } }, 'token syntax'],
      [{ target: { scheme: 'bearer', token: { fake: 1 } } }, 'token syntax'],
      [{ target: { scheme: 'bearer', token: { bearer: null } } }, 'token syntax'],
      [{}, 'invalid attributes'],
      [{ attributes: undefined }, 'invalid attributes'],
      [{ attributes: null as unknown as TokenAttributes }, 'invalid attributes'],
      [{ attributes: false as unknown as TokenAttributes }, 'invalid attributes'],
      [{ attributes: true as unknown as TokenAttributes }, 'invalid attributes'],
      [
        { attributes: { isGlobalAdmin: null } as unknown as TokenAttributes },
        'invalid attributes'
      ],
      [
        { attributes: { isGlobalAdmin: 1 } as unknown as TokenAttributes },
        'invalid attributes'
      ],
      [
        { attributes: { name: 'owner' } as unknown as TokenAttributes },
        'invalid attributes'
      ],
      [
        { attributes: { owner: null } as unknown as TokenAttributes },
        'invalid attributes'
      ],
      [
        {
          attributes: { owner: 'name', isGlobalAdmin: 1 } as unknown as TokenAttributes
        },
        'invalid attributes'
      ],
      [
        {
          attributes: {
            owner: 'name',
            isGlobalAdmin: null
          } as unknown as TokenAttributes
        },
        'invalid attributes'
      ],
      [
        {
          attributes: {
            owner: 'name',
            isGlobalAdmin: 'true'
          } as unknown as TokenAttributes
        },
        'invalid attributes'
      ],
      [
        {
          attributes: {
            owner: 'name',
            extra: 1
          } as unknown as TokenAttributes
        },
        'invalid attributes'
      ]
    ];

    await Promise.all(
      errors.map(async ([params, error]) => {
        await expect(
          updateAttributes({
            target: { scheme: 'bearer', token: { bearer: DEV_BEARER_TOKEN } },
            ...params
          })
        ).rejects.toMatchObject({ message: expect.stringContaining(error) });
      })
    );
  });
});

describe('::getOwnerEntries', () => {
  it('returns array of all auth entries owned by the target', async () => {
    expect.hasAssertions();

    const owner = dummyRootData.auth[0].attributes.owner;

    const newAuthEntry: InternalAuthEntry = {
      _id: new ObjectId(),
      attributes: { owner },
      scheme: 'bearer',
      token: { bearer: jest.requireActual('node:crypto').randomUUID() }
    };

    await expect(getOwnerEntries({ owner })).resolves.toStrictEqual([
      toPublicAuthEntry(dummyRootData.auth[0])
    ]);

    await (await getDb({ name: 'root' }))
      .collection<InternalAuthEntry>('auth')
      .insertOne(newAuthEntry);

    await expect(getOwnerEntries({ owner })).resolves.toStrictEqual([
      toPublicAuthEntry(dummyRootData.auth[0]),
      toPublicAuthEntry(newAuthEntry)
    ]);
  });

  it('returns empty array if target owner does not exist', async () => {
    expect.hasAssertions();

    await expect(getOwnerEntries({ owner: 'does-not-exist' })).resolves.toStrictEqual([]);
  });

  it('returns all auth entries if no owner specified', async () => {
    expect.hasAssertions();

    await expect(getOwnerEntries({})).resolves.toStrictEqual(
      dummyRootData.auth.map(toPublicAuthEntry)
    );

    await expect(getOwnerEntries({ owner: undefined })).resolves.toStrictEqual(
      dummyRootData.auth.map(toPublicAuthEntry)
    );
  });

  it('rejects if passed invalid data', async () => {
    expect.hasAssertions();

    const errors: [
      params: Partial<Parameters<typeof getOwnerEntries>[0]>,
      error: string
    ][] = [
      [{ owner: null } as unknown as TokenAttributes, 'invalid owner'],
      [{ owner: false } as unknown as TokenAttributes, 'invalid owner'],
      [{ owner: true } as unknown as TokenAttributes, 'invalid owner'],
      [{ owner: '', isGlobalAdmin: null } as unknown as TokenAttributes, 'invalid owner'],
      [{ owner: '', isGlobalAdmin: 1 } as unknown as TokenAttributes, 'invalid owner'],
      [{ owner: '', name: 'owner' } as unknown as TokenAttributes, 'invalid owner'],
      [{ owner: null } as unknown as TokenAttributes, 'invalid owner']
    ];

    await Promise.all(
      errors.map(async ([params, error]) => {
        await expect(getOwnerEntries(params)).rejects.toMatchObject({
          message: expect.stringContaining(error)
        });
      })
    );
  });
});

describe('::createEntry', () => {
  it('creates an auth entry and returns the new token', async () => {
    expect.hasAssertions();

    const crypto = jest.requireActual('node:crypto');
    const newToken1 = crypto.randomUUID();
    const newToken2 = crypto.randomUUID();

    mockRandomUUID.mockReturnValueOnce(newToken1);
    mockRandomUUID.mockReturnValueOnce(newToken2);

    const authDb = (await getDb({ name: 'root' })).collection<InternalAuthEntry>('auth');

    await expect(
      authDb.countDocuments({ 'attributes.owner': 'new-owner' })
    ).resolves.toBe(0);

    await expect(
      createEntry({ entry: { attributes: { owner: 'new-owner' } } })
    ).resolves.toStrictEqual<PublicAuthEntry>({
      attributes: { owner: 'new-owner' },
      scheme: 'bearer',
      token: { bearer: newToken1 }
    });

    await expect(
      authDb.countDocuments({
        attributes: { owner: 'new-owner' },
        scheme: 'bearer',
        token: { bearer: newToken1 }
      })
    ).resolves.toBe(1);

    await expect(
      createEntry({
        entry: { attributes: { owner: 'new-owner', isGlobalAdmin: true } }
      })
    ).resolves.toStrictEqual<PublicAuthEntry>({
      attributes: { owner: 'new-owner', isGlobalAdmin: true },
      scheme: 'bearer',
      token: { bearer: newToken2 }
    });

    await expect(
      authDb.countDocuments({
        attributes: { owner: 'new-owner', isGlobalAdmin: true },
        scheme: 'bearer',
        token: { bearer: newToken2 }
      })
    ).resolves.toBe(1);

    await expect(
      authDb.countDocuments({ 'attributes.owner': 'new-owner' })
    ).resolves.toBe(2);
  });

  it('rejects if a duplicate token is accidentally generated', async () => {
    expect.hasAssertions();

    await expect(
      createEntry({ entry: { attributes: { owner: 'new-owner' } } })
    ).rejects.toMatchObject({
      message: expect.stringContaining('token collision')
    });
  });

  it('rejects if passed invalid data', async () => {
    expect.hasAssertions();

    const errors: [params: Partial<Parameters<typeof createEntry>[0]>, error: string][] =
      [
        [{}, 'invalid entry data'],
        [{ entry: { attributes: undefined } }, 'invalid entry data'],
        [
          { entry: { attributes: null as unknown as TokenAttributes } },
          'invalid entry data'
        ],
        [
          { entry: { attributes: false as unknown as TokenAttributes } },
          'invalid entry data'
        ],
        [
          { entry: { attributes: true as unknown as TokenAttributes } },
          'invalid entry data'
        ],
        [
          { entry: { attributes: {} as unknown as TokenAttributes } },
          'invalid entry data'
        ],
        [
          {
            entry: { attributes: { isGlobalAdmin: null } as unknown as TokenAttributes }
          },
          'invalid entry data'
        ],
        [
          { entry: { attributes: { isGlobalAdmin: 1 } as unknown as TokenAttributes } },
          'invalid entry data'
        ],
        [
          {
            entry: { attributes: { isGlobalAdmin: true } as unknown as TokenAttributes }
          },
          'invalid entry data'
        ],
        [
          { entry: { attributes: { name: 'owner' } as unknown as TokenAttributes } },
          'invalid entry data'
        ],
        [
          { entry: { attributes: { owner: null } as unknown as TokenAttributes } },
          'invalid entry data'
        ],
        [
          {
            entry: {
              attributes: {
                owner: 'name',
                isGlobalAdmin: 1
              } as unknown as TokenAttributes
            }
          },
          'invalid entry data'
        ],
        [
          {
            entry: {
              attributes: {
                owner: 'name',
                isGlobalAdmin: null
              } as unknown as TokenAttributes
            }
          },
          'invalid entry data'
        ],
        [
          {
            entry: {
              attributes: {
                owner: 'name',
                isGlobalAdmin: 'true'
              } as unknown as TokenAttributes
            }
          },
          'invalid entry data'
        ],
        [
          {
            entry: {
              attributes: {
                owner: 'name',
                extra: 1
              } as unknown as TokenAttributes
            }
          },
          'invalid entry data'
        ]
      ];

    await Promise.all(
      errors.map(async ([params, error]) => {
        await expect(createEntry(params)).rejects.toMatchObject({
          message: expect.stringContaining(error)
        });
      })
    );
  });
});

describe('::deleteEntry', () => {
  it('deletes an auth entry', async () => {
    expect.hasAssertions();

    const authDb = (await getDb({ name: 'root' })).collection('auth');

    await expect(authDb.countDocuments()).resolves.toBe(dummyRootData.auth.length);

    await expect(
      deleteEntry({
        target: { scheme: 'bearer', token: { bearer: DUMMY_BEARER_TOKEN } }
      })
    ).resolves.toBeUndefined();

    await expect(authDb.countDocuments()).resolves.toBe(dummyRootData.auth.length - 1);

    await expect(
      deleteEntry({
        target: { scheme: 'bearer', token: { bearer: DEV_BEARER_TOKEN } }
      })
    ).resolves.toBeUndefined();

    await expect(authDb.countDocuments()).resolves.toBe(dummyRootData.auth.length - 2);
  });

  it('rejects if the auth entry is not found', async () => {
    expect.hasAssertions();

    await expect(
      deleteEntry({
        target: { scheme: 'bearer', token: { bearer: NULL_BEARER_TOKEN } }
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining('authentication scheme and token combination')
    });
  });

  it('rejects if passed invalid data', async () => {
    expect.hasAssertions();

    const errors: [params: Partial<Parameters<typeof deleteEntry>[0]>, error: string][] =
      [
        [{}, 'invalid invocation'],
        [{ target: undefined }, 'invalid invocation'],
        [{ target: null as unknown as TargetToken }, 'invalid auth data'],
        [{ target: false as unknown as TargetToken }, 'invalid auth data'],
        [{ target: true as unknown as TargetToken }, 'invalid auth data'],
        [{ target: {} }, 'invalid scheme'],
        [{ target: { scheme: '' } }, 'invalid scheme'],
        [{ target: { scheme: 'bearer', token: {} } }, 'token syntax'],
        [{ target: { scheme: 'bearer', token: { fake: 1 } } }, 'token syntax'],
        [{ target: { scheme: 'bearer', token: { bearer: null } } }, 'token syntax']
      ];

    await Promise.all(
      errors.map(async ([params, error]) => {
        await expect(deleteEntry(params)).rejects.toMatchObject({
          message: expect.stringContaining(error)
        });
      })
    );
  });
});

it('allows multiple different auth entries of various schemes to coexist', async () => {
  expect.hasAssertions();

  mockRandomUUID.mockImplementation(jest.requireActual('node:crypto').randomUUID);

  const uuid = randomUUID();
  const authDb = (await getDb({ name: 'root' })).collection('auth');

  mutableAuthSchemes.push('new-scheme-1');
  mutableAuthSchemes.push('new-scheme-2');

  const newEntryRed: WithoutId<InternalAuthEntry> = {
    attributes: {
      owner: 'owner-red',
      isGlobalAdmin: false,
      createdAt: Date.now()
    } as TokenAttributes,
    scheme: 'new-scheme-1' as AuthScheme,
    token: { id1: uuid.slice(0, 32), id2: uuid.slice(32) }
  };

  const newEntryBlue: WithoutId<InternalAuthEntry> = {
    attributes: { owner: 'owner-blue', isGlobalAdmin: true },
    scheme: 'new-scheme-2' as AuthScheme,
    token: {
      uuid,
      salt: uuid.slice(0, 3),
      granter: { key: `${uuid.slice(0, 3)}-${uuid}` }
    }
  };

  const actual_deriveSchemeAndToken = deriveSchemeAndToken;

  jest
    .spyOn(NextAuthSpyTarget, 'deriveSchemeAndToken')
    .mockImplementation(async function ({
      authString,
      authData
    }: {
      authString?: string;
      authData?: TargetToken;
    }): Promise<NextAuthSpyTarget.Token> {
      let ret: NextAuthSpyTarget.Token | undefined;

      if (
        authString?.startsWith('new-scheme-1') ||
        authData?.scheme?.startsWith('new-scheme-1')
      ) {
        ret = {
          scheme: 'new-scheme-1' as AuthScheme,
          token: { id1: uuid.slice(0, 32), id2: uuid.slice(32) }
        };
      } else if (
        authString?.startsWith('new-scheme-2') ||
        authData?.scheme?.startsWith('new-scheme-2')
      ) {
        ret = {
          scheme: 'new-scheme-2' as AuthScheme,
          token: {
            uuid,
            salt: uuid.slice(0, 3),
            granter: { key: `${uuid.slice(0, 3)}-${uuid}` }
          }
        };
      } else {
        // eslint-disable-next-line prefer-rest-params
        ret = await actual_deriveSchemeAndToken(arguments[0]);
      }

      return Promise.resolve(ret);
    } as typeof deriveSchemeAndToken);

  jest.spyOn(NextAuthSpyTarget, 'isTokenAttributes').mockReturnValue(true);

  const newEntry1 = await createEntry({ entry: { attributes: { owner: 'owner-1' } } });
  const newEntry2 = await createEntry({
    entry: { attributes: { owner: 'owner-2', isGlobalAdmin: true } }
  });

  // * Pseudo-createEntry calls
  await authDb.insertOne(newEntryRed);
  await authDb.insertOne(newEntryBlue);

  await expect(
    authenticateHeader({ header: `${newEntry1.scheme} ${newEntry1.token.bearer}` })
  ).resolves.toStrictEqual({ authenticated: true });

  await expect(
    authenticateHeader({ header: `${newEntry2.scheme} ${newEntry2.token.bearer}` })
  ).resolves.toStrictEqual({ authenticated: true });

  await expect(
    authenticateHeader({ header: `${newEntryRed.scheme} ${newEntryRed.token.id1}` })
  ).resolves.toStrictEqual({ authenticated: true });

  await expect(
    authenticateHeader({ header: `${newEntryBlue.scheme} ${newEntryBlue.token.uuid}` })
  ).resolves.toStrictEqual({ authenticated: true });

  await expect(
    authenticateHeader({ header: `${newEntry1.scheme} ${newEntryBlue.token.uuid}` })
  ).resolves.toStrictEqual({ authenticated: false });

  await expect(
    authorizeHeader({
      header: `${newEntry1.scheme} ${newEntry1.token.bearer}`,
      constraints: 'isGlobalAdmin'
    })
  ).resolves.toStrictEqual({ authorized: false, error: expect.any(String) });

  await expect(
    authorizeHeader({
      header: `${newEntry2.scheme} ${newEntry2.token.bearer}`,
      constraints: 'isGlobalAdmin'
    })
  ).resolves.toStrictEqual({ authorized: true });

  await expect(
    authorizeHeader({
      header: `${newEntryRed.scheme} ${newEntryRed.token.id1}`,
      constraints: 'isGlobalAdmin'
    })
  ).resolves.toStrictEqual({ authorized: false, error: expect.any(String) });

  await expect(
    authorizeHeader({
      header: `${newEntryBlue.scheme} ${newEntryBlue.token.uuid}`,
      constraints: 'isGlobalAdmin'
    })
  ).resolves.toStrictEqual({ authorized: true });
});
