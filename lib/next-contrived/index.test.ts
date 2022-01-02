import { useMockDateNow } from 'multiverse/mongo-common';
import { setupMemoryServerOverride } from 'multiverse/mongo-test';
import { isDueForContrivedError } from 'multiverse/next-contrived';
import { mockEnvFactory } from 'testverse/setup';

setupMemoryServerOverride();
useMockDateNow();

const withMockedEnv = mockEnvFactory({ NODE_ENV: 'test' });

describe('::isDueForContrivedError', () => {
  it('returns true every REQUESTS_PER_CONTRIVED_ERROR-th call', async () => {
    expect.hasAssertions();

    await withMockedEnv(
      () => {
        expect(isDueForContrivedError()).toBeTrue();
        expect(isDueForContrivedError()).toBeTrue();
        expect(isDueForContrivedError()).toBeTrue();
        expect(isDueForContrivedError()).toBeTrue();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '1' }
    );

    await withMockedEnv(
      () => {
        expect(isDueForContrivedError()).toBeFalse();
        expect(isDueForContrivedError()).toBeTrue();
        expect(isDueForContrivedError()).toBeFalse();
        expect(isDueForContrivedError()).toBeTrue();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '2' }
    );

    await withMockedEnv(
      () => {
        expect(isDueForContrivedError()).toBeFalse();
        expect(isDueForContrivedError()).toBeFalse();
        expect(isDueForContrivedError()).toBeTrue();
        expect(isDueForContrivedError()).toBeFalse();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '3' }
    );

    await withMockedEnv(
      () => {
        expect(isDueForContrivedError()).toBeFalse();
        expect(isDueForContrivedError()).toBeFalse();
        // ? Note: request counter doesn't reset between withMockedEnv calls!
        expect(isDueForContrivedError()).toBeTrue();
        expect(isDueForContrivedError()).toBeFalse();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '4' }
    );

    await withMockedEnv(
      () => {
        expect(isDueForContrivedError()).toBeFalse();
        expect(isDueForContrivedError()).toBeFalse();
        expect(isDueForContrivedError()).toBeFalse();
        // ? Note: request counter doesn't reset between withMockedEnv calls!
        expect(isDueForContrivedError()).toBeTrue();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '5' }
    );

    await withMockedEnv(
      () => {
        expect(isDueForContrivedError()).toBeFalse();
        expect(isDueForContrivedError()).toBeFalse();
        expect(isDueForContrivedError()).toBeFalse();
        expect(isDueForContrivedError()).toBeFalse();
        expect(isDueForContrivedError()).toBeFalse();
      },
      { REQUESTS_PER_CONTRIVED_ERROR: '0' }
    );
  });
});
