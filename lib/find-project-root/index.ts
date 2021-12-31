import { sync as findUpSync } from 'find-up';
import { GuruMeditationError } from 'named-app-errors';
import { toss } from 'toss-expression';
import { dirname } from 'path';

const memory = { rootPath: null } as { rootPath: string | null };

/**
 * Overwrite the memoized findProjectRoot result with an explicit value. Useful
 * in testing environments and complex setups.
 */
export function setProjectRoot(rootPath: string | null) {
  memory.rootPath = rootPath;
}

/**
 * Synchronously finds the root of a project by walking up parent
 * directories beginning at `process.cwd()` and looking for certain files/dirs.
 */
export function findProjectRoot() {
  return (memory.rootPath =
    memory.rootPath ??
    dirname(
      findUpSync('next.config.js') ||
        findUpSync('projector.config.js') ||
        findUpSync('.git') ||
        toss(
          new GuruMeditationError(
            'could not find project root: none of "next.config.js", "projector.config.js", nor ".git" were found in any ancestor directory'
          )
        )
    ));
}
