import { getEnv } from 'multiverse/next-env';

/**
 * Global (but only per lambda instance's lifetime) request counting state.
 */
let requestCounter = 0;

/**
 * Returns `true` if a request should be rejected with a pseudo-error.
 *
 * Note that this is a per-serverless-function request counter and not global
 * across all Vercel virtual machines.
 */
export function isDueForContrivedError() {
  const { REQUESTS_PER_CONTRIVED_ERROR: reqPerErr } = getEnv();

  if (++requestCounter >= reqPerErr) {
    requestCounter = 0;
    return true;
  } else {
    return false;
  }
}
