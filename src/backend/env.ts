import { getEnv as getDefaultEnv } from 'multiverse/next-env';
import type { Environment } from 'multiverse/next-env';

/**
 * Returns an object representing the application's runtime environment.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function getEnv<T extends Environment = Environment>() {
  const env = getDefaultEnv({
    GITHUB_PAT: process.env.GITHUB_PAT || null
  });

  return env as typeof env & T;
}
