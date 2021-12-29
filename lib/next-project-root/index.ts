import { sync as findUpSync } from 'find-up';
import { GuruMeditationError } from 'named-app-errors';
import { toss } from 'toss-expression';
import { dirname } from 'path';

/**
 * Synchronously finds the root of a Next.js project by walking up parent
 * directories beginning at `process.cwd()`.
 */
export function findNextJSProjectRoot() {
  return dirname(
    findUpSync('next.config.js') ||
      toss(
        new GuruMeditationError(
          'could not find Next.js project root: next.config.js not found in any ancestor directory'
        )
      )
  );
}
