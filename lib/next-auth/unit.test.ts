import { useMockDateNow } from 'multiverse/mongo-common';
import { setupTestDb } from 'multiverse/mongo-test';

import {
  BANNED_BEARER_TOKEN,
  DEV_BEARER_TOKEN,
  DUMMY_BEARER_TOKEN,
  NULL_BEARER_TOKEN,
  getToken,
  isValidAuthHeader
} from 'multiverse/next-auth';

import type { AuthScheme } from 'multiverse/next-auth';

setupTestDb();
useMockDateNow();

describe('::getToken', () => {
  it('handles schemes case-insensitively', async () => {
    expect.hasAssertions();

    const expected = await getToken({ header: 'bearer 123' });

    await expect(getToken({ header: 'bEaReR 123' })).resolves.toStrictEqual(expected);
    await expect(getToken({ header: 'BeaRer 123' })).resolves.toStrictEqual(expected);
    await expect(getToken({ header: 'BEARER 123' })).resolves.toStrictEqual(expected);
  });

  it('handles bearer scheme with token', async () => {
    expect.hasAssertions();

    await expect(getToken({ header: 'bearer abc-123' })).resolves.toStrictEqual({
      scheme: 'bearer',
      token: { bearer: 'abc-123' }
    });
  });

  it('rejects bearer scheme with multipart token', async () => {
    expect.hasAssertions();

    await expect(
      getToken({ header: 'bearer abc-123,\ndef-234,ghi-345,\n\njkl-456,mno-567' })
    ).rejects.toThrow('invalid HTTP Authorization parameter(s)');
  });

  it('rejects on missing and null headers', async () => {
    expect.hasAssertions();

    await expect(getToken({ header: '' })).rejects.toThrow(
      'invalid HTTP Authorization header'
    );

    await expect(getToken({ header: undefined })).rejects.toThrow(
      'invalid HTTP Authorization header'
    );
  });

  it('rejects on badly formatted headers', async () => {
    expect.hasAssertions();

    await expect(getToken({ header: 'bearer' })).rejects.toThrow(
      'invalid HTTP Authorization header'
    );

    await expect(getToken({ header: 'bearer-bearer' })).rejects.toThrow(
      'invalid HTTP Authorization header'
    );
  });

  it('rejects on headers with unknown schemes', async () => {
    expect.hasAssertions();

    await expect(getToken({ header: 'unknown xyz' })).rejects.toThrow(
      'invalid HTTP Authorization scheme (disallowed or unknown)'
    );
  });

  it('rejects if using a disallowed scheme', async () => {
    expect.hasAssertions();

    await expect(
      getToken({
        header: 'bearer 123',
        allowedSchemes: ['none' as unknown as AuthScheme]
      })
    ).rejects.toThrow('invalid HTTP Authorization scheme (disallowed or unknown)');
  });
});

describe('::isValidAuthHeader', () => {
  it('returns a valid response if bearer token exists in database', async () => {
    expect.hasAssertions();

    await expect(
      isValidAuthHeader({
        header: `bearer ${DUMMY_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({ valid: true });

    await expect(
      isValidAuthHeader({
        header: `BEARER ${DEV_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({ valid: true });
  });

  it('returns a valid response even if bearer token is banned', async () => {
    expect.hasAssertions();

    await expect(
      isValidAuthHeader({
        header: `bearer ${BANNED_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({ valid: true });
  });

  it('returns a not-valid response if bearer token does not exist in database', async () => {
    expect.hasAssertions();

    await expect(
      isValidAuthHeader({
        header: `bearer ${NULL_BEARER_TOKEN}`
      })
    ).resolves.toStrictEqual({ valid: false });
  });

  it('returns a not-valid response with an "error" prop if using a disallowed scheme', async () => {
    expect.hasAssertions();

    await expect(
      isValidAuthHeader({
        header: 'bearer 123',
        allowedSchemes: ['none' as unknown as AuthScheme]
      })
    ).resolves.toStrictEqual({
      valid: false,
      error: expect.objectContaining({
        message: expect.stringContaining('(disallowed or unknown)')
      })
    });
  });
});
