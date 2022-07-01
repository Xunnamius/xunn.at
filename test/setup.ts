import { debugNamespace } from 'universe/constants';
import { name as pkgName, version as pkgVersion } from 'package';
import { verifyEnvironment } from '../expect-env';
import { TrialError, GuruMeditationError } from 'universe/error';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { toss } from 'toss-expression';
import { defaultConfig } from 'universe/backend/api';
import execa from 'execa';
import uniqueFilename from 'unique-filename';
import { debugFactory } from 'multiverse/debug-extended';
import gitFactory from 'simple-git';
// ? See: https://github.com/jest-community/jest-extended#setup
import 'jest-extended/all';
import 'jest-extended';
import '@testing-library/jest-dom/extend-expect';

import type { Debugger } from 'multiverse/debug-extended';
import type { SimpleGit } from 'simple-git';
import type {
  NextApiHandler,
  NextApiRequest,
  NextApiResponse,
  PageConfig
} from 'next';
import type { Promisable } from 'type-fest';

const { writeFile, access: accessFile } = fs;
const debug = debugFactory(`${debugNamespace}:jest-setup`);

debug(`pkgName: "${pkgName}"`);
debug(`pkgVersion: "${pkgVersion}"`);

let env = {};

try {
  require('fs').accessSync('.env');
  env = require('dotenv').config().parsed;
  debug('.env vars: %O', env);
} catch (e) {
  debug(`.env support disabled; reason: ${e}`);
}

verifyEnvironment();

/**
 * A mock Next.js API handler that sends an empty object Reponse with a 200
 * status code.
 */
export const noopHandler = async (_req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).send({});
};

/**
 * This function wraps mock Next.js API handler functions so that they provide
 * the default (or a custom) API configuration object.
 */
export const wrapHandler = (handler: NextApiHandler, config?: PageConfig) => {
  const api = async (req: NextApiRequest, res: NextApiResponse) => handler(req, res);
  api.config = config || defaultConfig;
  return api;
};

/**
 * Contains the expected shapes of the gzipped tar archives under
 * `test/fixtures`.
 */
export const expectedEntries = {
  monorepo: [
    {
      headers: expect.objectContaining({ name: 'monorepo/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/package.json' }),
      data:
        '{\n' +
        '  "name": "dummy-monorepo",\n' +
        '  "workspaces": [\n' +
        '    "packages/pkg-1",\n' +
        '    "packages/pkg-2"\n' +
        '  ]\n' +
        '}\n'
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/pkg-1/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({
        name: 'monorepo/packages/pkg-1/package.json'
      }),
      data:
        '{\n' +
        '  "name": "dummy-monorepo-pkg-2",\n' +
        '  "version": "1.0.0",\n' +
        '  "main": "index.js"\n' +
        '}\n'
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/pkg-1/index.js' }),
      data: "console.log('dummy monorepo pkg-1 test');\n"
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/pkg-2/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({
        name: 'monorepo/packages/pkg-2/package.json'
      }),
      data:
        '{\n' +
        '  "name": "dummy-monorepo-pkg-2",\n' +
        '  "version": "1.0.0",\n' +
        '  "main": "index.js"\n' +
        '}\n'
    },
    {
      headers: expect.objectContaining({ name: 'monorepo/packages/pkg-2/index.js' }),
      data: "console.log('dummy monorepo pkg-2 test');\n"
    }
  ],
  pkg1: [
    {
      headers: expect.objectContaining({ name: 'pkg-1/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({ name: 'pkg-1/package.json' }),
      data:
        '{\n' +
        // ? Oops... too late now
        '  "name": "dummy-monorepo-pkg-2",\n' +
        '  "version": "1.0.0",\n' +
        '  "main": "index.js"\n' +
        '}\n'
    },
    {
      headers: expect.objectContaining({ name: 'pkg-1/index.js' }),
      data: "console.log('dummy monorepo pkg-1 test');\n"
    }
  ],
  pkg2: [
    {
      headers: expect.objectContaining({ name: 'pkg-2/' }),
      data: ''
    },
    {
      headers: expect.objectContaining({ name: 'pkg-2/package.json' }),
      data:
        '{\n' +
        '  "name": "dummy-monorepo-pkg-2",\n' +
        '  "version": "1.0.0",\n' +
        '  "main": "index.js"\n' +
        '}\n'
    },
    {
      headers: expect.objectContaining({ name: 'pkg-2/index.js' }),
      data: "console.log('dummy monorepo pkg-2 test');\n"
    }
  ]
};

// TODO: XXX: add these brand new tools to where they're supposed to be!

export class FactoryExhaustionError extends TrialError {}
export function itemFactory<T>(testItems: T[]) {
  const nextItem = Object.assign(
    () => {
      const next = nextItem['$iter'].next() as IteratorResult<T, unknown>;
      if (next.done) {
        throw new FactoryExhaustionError(
          'item factory iterator exhausted unexpectedly'
        );
      } else return next.value;
    },
    {
      items: testItems,
      count: testItems.length,
      $iter: testItems.values(),
      *[Symbol.iterator]() {
        while (true) {
          try {
            yield nextItem();
          } catch (e) {
            if (e instanceof FactoryExhaustionError) return;
            else throw e;
          }
        }
      },
      async *[Symbol.asyncIterator]() {
        while (true) {
          try {
            // eslint-disable-next-line no-await-in-loop
            yield await nextItem();
          } catch (e) {
            if (e instanceof FactoryExhaustionError) return;
            else throw e;
          }
        }
      }
    }
  );

  Object.defineProperty(nextItem, 'length', {
    configurable: false,
    enumerable: false,
    set: () =>
      toss(new SyntaxError('did you mean to use ::count instead of ::length?')),
    get: () =>
      toss(new SyntaxError('did you mean to use ::count instead of ::length?'))
  });

  return nextItem;
}

// TODO: XXX: make this into a separate (mock-argv) package (along w/ the below)
export type MockArgvOptions = {
  /**
   * By default, the first two elements in `process.argv` are preserved. Setting
   * `replace` to `true` will cause the entire process.argv array to be replaced
   * @default false
   */
  replace?: boolean;
};

// TODO: XXX: make this into a separate (mock-env) package (along w/ the below)
export type MockEnvOptions = {
  /**
   * By default, the `process.env` object is emptied and re-hydrated with
   * `newEnv`. Setting `replace` to `false` will cause `newEnv` to be appended
   * instead
   * @default true
   */
  replace?: boolean;
};

// TODO: XXX: make this into a separate (mock-argv) package
export async function withMockedArgv(
  fn: () => unknown,
  newArgv: string[],
  options: MockArgvOptions = { replace: false }
) {
  // ? Take care to preserve the original argv array reference in memory
  const prevArgv = process.argv.splice(options?.replace ? 0 : 2, process.argv.length);
  process.argv.push(...newArgv);

  try {
    await fn();
  } finally {
    process.argv.splice(options?.replace ? 0 : 2, process.argv.length);
    process.argv.push(...prevArgv);
  }
}

// TODO: XXX: make this into a separate (mock-argv) package (along w/ the above)
export function mockArgvFactory(
  newArgv: typeof process.argv,
  options: MockArgvOptions = { replace: false }
) {
  const factoryNewArgv = newArgv;
  const factoryOptions = options;

  return (fn: () => unknown, newArgv?: string[], options?: MockArgvOptions) => {
    return withMockedArgv(
      fn,
      [...factoryNewArgv, ...(newArgv || [])],
      options || factoryOptions
    );
  };
}

// TODO: XXX: make this into a separate (mock-env) package
export async function withMockedEnv(
  fn: () => unknown,
  newEnv: Record<string, string>,
  options: MockEnvOptions = { replace: true }
) {
  const prevEnv = { ...process.env };
  const clearEnv = () =>
    Object.getOwnPropertyNames(process.env).forEach(
      (prop) => delete process.env[prop]
    );

  // ? Take care to preserve the original env object reference in memory
  if (options.replace) clearEnv();
  Object.assign(process.env, newEnv);

  try {
    await fn();
  } finally {
    clearEnv();
    Object.assign(process.env, prevEnv);
  }
}

// TODO: XXX: make this into a separate (mock-env) package (along w/ the above)
export function mockEnvFactory(
  newEnv: Record<string, string | undefined>,
  options: MockEnvOptions = { replace: true }
) {
  const factoryNewEnv = newEnv;
  const factoryOptions = options;

  return (
    fn: () => unknown,
    newEnv?: Record<string, string | undefined>,
    options?: MockEnvOptions
  ) => {
    const env = { ...factoryNewEnv, ...(newEnv || {}) };
    const opts = { ...options, ...factoryOptions };

    // ? The process.env proxy casts undefineds to strings, so we'll delete them
    Object.keys(env).forEach((key) => env[key] === undefined && delete env[key]);
    return withMockedEnv(fn, env as Record<string, string>, opts);
  };
}

// TODO: XXX: make this into a separate (jest-isolated-import) package
export async function withDebugEnabled(fn: () => Promisable<void>) {
  const namespaces = debugFactory.disable();
  debugFactory.enable('*');

  try {
    await fn();
  } finally {
    debugFactory.disable();
    debugFactory.enable(namespaces);
  }
}

// TODO: XXX: make this into a separate (jest-isolated-import) package

/**
 * Performs a module import as if it were being imported for the first time.
 *
 * Note that this function breaks the "require caching" expectation of Node.js
 * modules. Problems can arise, for example, when closing an app-wide database
 * connection in your test cleanup phase and expecting it to close for the
 * isolated module too. In this case, the isolated module has its own isolated
 * "app-wide" connection that would not actually be closed and could cause your
 * test to hang unexpectedly, even when all tests pass.
 */
export function isolatedImport<T = unknown>({
  path,
  useDefault
}: {
  /**
   * Path to the module to import. Module resolution is handled by `require`.
   */
  path: string;
  /**
   * By default, only if `module.__esModule === true`, the default export will
   * be returned instead. Use `useDefault` to override this behavior in either
   * direction.
   */
  useDefault?: boolean;
}) {
  let pkg: T | undefined;

  // ? Cache-busting
  jest.isolateModules(() => {
    debug(
      `performing isolated import of ${path}${
        useDefault ? ' (returning default by force)' : ''
      }`
    );

    pkg = ((r) => {
      return r.default &&
        (useDefault === true ||
          (useDefault !== false && r.__esModule && Object.keys(r).length == 1))
        ? r.default
        : r;
    })(require(path));
  });

  return pkg as T;
}

// TODO: XXX: make this into a separate package (along with the above)
export function isolatedImportFactory<T = unknown>({
  path,
  useDefault
}: {
  /**
   * Path to the module to import. Module resolution is handled by `require`.
   */
  path: string;
  /**
   * By default, only if `module.__esModule === true`, the default export will
   * be returned instead. Use `useDefault` to override this behavior in either
   * direction.
   */
  useDefault?: boolean;
}) {
  return () => isolatedImport<T>({ path: path, useDefault: useDefault });
}

// TODO: XXX: make this into a separate package (along with the above)
/**
 * While `isolatedImport` performs a module import as if it were being
 * imported for the first time, `protectedImport` wraps `isolatedImport`
 * with `withMockedExit`. This makes `protectedImport` useful for testing
 * IIFE modules such as CLI entry points an externals.
 */
export async function protectedImport<T = unknown>({
  path,
  useDefault,
  expectedExitCode
}: {
  /**
   * Path to the module to import. Module resolution is handled by `require`.
   */
  path: string;
  /**
   * By default, only if `module.__esModule === true`, the default export will
   * be returned instead. Use `useDefault` to override this behavior in either
   * direction.
   */
  useDefault?: boolean;
  /**
   * The code that must be passed to process.exit by the imported module. If
   * `undefined` (default), then process.exit must not be called.
   *
   * @default undefined
   */
  expectedExitCode?: number | 'non-zero' | undefined;
}) {
  let pkg: unknown = undefined;

  await withMockedExit(async ({ exitSpy }) => {
    pkg = await isolatedImport({ path: path, useDefault: useDefault });
    if (expect) {
      expectedExitCode == 'non-zero'
        ? expect(exitSpy).not.toBeCalledWith(0)
        : expectedExitCode === undefined
        ? expect(exitSpy).not.toBeCalled()
        : expect(exitSpy).toBeCalledWith(expectedExitCode);
    } else {
      debug.warn('"expect" object not found, so exit check was skipped');
    }
  });

  return pkg as T;
}

// TODO: XXX: make this into a separate package (along with the above)
export function protectedImportFactory<T = unknown>({
  path,
  useDefault
}: {
  /**
   * Path to the module to import. Module resolution is handled by `require`.
   */
  path: string;
  /**
   * By default, only if `module.__esModule === true`, the default export will
   * be returned instead. Use `useDefault` to override this behavior in either
   * direction.
   */
  useDefault?: boolean;
  /**
   * The code that must be passed to process.exit by the imported module. If
   * `undefined` (default), then process.exit must not be called.
   *
   * @default undefined
   */
  expectedExitCode?: number | 'non-zero' | undefined;
}) {
  return async (params?: {
    /**
     * The code that must be passed to process.exit by the imported module. If
     * `undefined` (default), then process.exit must not be called.
     *
     * @default undefined
     */
    expectedExitCode?: number | 'non-zero' | undefined;
  }) => {
    return protectedImport<T>({
      path: path,
      useDefault: useDefault,
      expectedExitCode: params?.expectedExitCode
    });
  };
}

// TODO: XXX: make this into a separate (mock-exit) package
export async function withMockedExit(
  fn: (spies: { exitSpy: jest.SpyInstance }) => unknown
) {
  const exitSpy = jest
    .spyOn(process, 'exit')
    .mockImplementation(() => undefined as never);

  try {
    await fn({ exitSpy });
  } finally {
    exitSpy.mockRestore();
  }
}

// TODO: XXX: make this into a separate (mock-output) package
/**
 * Any output generated within `fn` will be captured by an output spy instead of
 * emitting to the console (stdout/stderr).
 *
 * However, not that `stdErrSpy` is set to passthrough mode by default. If
 * desired, use the `passthrough` option to prevent this.
 */
export async function withMockedOutput(
  fn: (spies: {
    logSpy: jest.SpyInstance;
    warnSpy: jest.SpyInstance;
    errorSpy: jest.SpyInstance;
    infoSpy: jest.SpyInstance;
    stdoutSpy: jest.SpyInstance;
    stdErrSpy: jest.SpyInstance;
  }) => unknown,
  options?: {
    /**
     * Determine if spies provide mock implementations for output functions,
     * thus preventing any output to the terminal, or if spies should
     * passthrough output as normal.
     *
     * Passthrough is disabled for all spies by default (except `stdErrSpy`).
     * Pass `true` to enable passthrough for a specific spy.
     */
    passthrough?: {
      /**
       * @default false
       */
      logSpy?: boolean;
      /**
       * @default false
       */
      warnSpy?: boolean;
      /**
       * @default false
       */
      errorSpy?: boolean;
      /**
       * @default false
       */
      infoSpy?: boolean;
      /**
       * @default false
       */
      stdoutSpy?: boolean;
      /**
       * @default true
       */
      stdErrSpy?: boolean;
    };
  }
) {
  const logSpy = jest.spyOn(console, 'log');
  const warnSpy = jest.spyOn(console, 'warn');
  const errorSpy = jest.spyOn(console, 'error');
  const infoSpy = jest.spyOn(console, 'info');
  const stdoutSpy = jest.spyOn(process.stdout, 'write');
  const stdErrSpy = jest.spyOn(process.stderr, 'write');

  !options?.passthrough?.logSpy && logSpy.mockImplementation(() => undefined);
  !options?.passthrough?.warnSpy && warnSpy.mockImplementation(() => undefined);
  !options?.passthrough?.errorSpy && errorSpy.mockImplementation(() => undefined);
  !options?.passthrough?.infoSpy && infoSpy.mockImplementation(() => undefined);
  !options?.passthrough?.stdoutSpy && stdoutSpy.mockImplementation(() => true);
  options?.passthrough?.stdErrSpy === false &&
    stdErrSpy.mockImplementation(() => true);

  try {
    await fn({
      logSpy,
      warnSpy,
      errorSpy,
      infoSpy,
      stdoutSpy,
      stdErrSpy
    });
  } finally {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    infoSpy.mockRestore();
    stdoutSpy.mockRestore();
    stdErrSpy.mockRestore();
  }
}

export function mockOutputFactory(options: {
  /**
   * Determine if spies provide mock implementations for output functions,
   * thus preventing any output to the terminal, or if spies should
   * passthrough output as normal.
   *
   * Passthrough is disabled for all spies by default (except `stdErrSpy`).
   * Pass `true` to enable passthrough for a specific spy.
   */
  passthrough?: {
    /**
     * @default false
     */
    logSpy?: boolean;
    /**
     * @default false
     */
    warnSpy?: boolean;
    /**
     * @default false
     */
    errorSpy?: boolean;
    /**
     * @default false
     */
    infoSpy?: boolean;
    /**
     * @default false
     */
    stdoutSpy?: boolean;
    /**
     * @default true
     */
    stdErrSpy?: boolean;
  };
}) {
  const factoryOptions = options;

  return async (
    fn: (spies: {
      logSpy: jest.SpyInstance;
      warnSpy: jest.SpyInstance;
      errorSpy: jest.SpyInstance;
      infoSpy: jest.SpyInstance;
      stdoutSpy: jest.SpyInstance;
      stdErrSpy: jest.SpyInstance;
    }) => unknown,
    options?: {
      /**
       * Determine if spies provide mock implementations for output functions,
       * thus preventing any output to the terminal, or if spies should
       * passthrough output as normal.
       *
       * Passthrough is disabled for all spies by default (except `stdErrSpy`).
       * Pass `true` to enable passthrough for a specific spy.
       */
      passthrough?: {
        /**
         * @default false
         */
        logSpy?: boolean;
        /**
         * @default false
         */
        warnSpy?: boolean;
        /**
         * @default false
         */
        errorSpy?: boolean;
        /**
         * @default false
         */
        infoSpy?: boolean;
        /**
         * @default false
         */
        stdoutSpy?: boolean;
        /**
         * @default true
         */
        stdErrSpy?: boolean;
      };
    }
  ) => {
    return withMockedOutput(fn, { ...factoryOptions, ...(options || {}) });
  };
}

// TODO: XXX: make this into a separate (run) package (along w/ below)
export interface RunOptions extends execa.Options {
  /**
   * Setting this to `true` rejects the promise instead of resolving it with the error.
   * @default false
   */
  reject?: boolean;
}

// TODO: XXX: make this into a separate (run) package
// ! By default, does NOT reject on bad exit code (set reject: true to override)
export async function run(file: string, args?: string[], options?: RunOptions) {
  debug(`executing "${file}" with:`);
  debug(`  args: %O`, args);
  debug(`  runner options %O`, options);

  const result = await execa(file, args, { reject: false, ...options });
  debug('execution result: %O', result);

  return result;
}

// TODO: XXX: make this into a separate (run) package (along w/ above)
export function runnerFactory(file: string, args?: string[], options?: RunOptions) {
  const factoryArgs = args;
  const factoryOptions = options;

  return (args?: string[], options?: RunOptions) =>
    run(file, args || factoryArgs, { ...factoryOptions, ...options });
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export interface FixtureOptions
  extends Partial<WebpackTestFixtureOptions>,
    Partial<GitRepositoryFixtureOptions>,
    Partial<DummyDirectoriesFixtureOptions> {
  performCleanup: boolean;
  use: MockFixture[];
  initialFileContents: { [filePath: string]: string };
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export interface WebpackTestFixtureOptions {
  webpackVersion: string;
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export interface GitRepositoryFixtureOptions {
  setupGit: (git: SimpleGit) => unknown;
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export interface DummyDirectoriesFixtureOptions {
  directoryPaths: string[];
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
// eslint-disable-next-line @typescript-eslint/ban-types
export interface FixtureContext<CustomOptions extends Record<string, unknown> = {}>
  extends Partial<TestResultProvider>,
    Partial<TreeOutputProvider>,
    Partial<GitProvider> {
  root: string;
  testIdentifier: string;
  options: FixtureOptions & CustomOptions;
  using: MockFixture[];
  fileContents: { [filePath: string]: string };
  debug: Debugger;
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export interface TestResultProvider {
  testResult: { exitCode: number; stdout: string; stderr: string };
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export interface TreeOutputProvider {
  treeOutput: string;
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export interface GitProvider {
  git: SimpleGit;
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
// eslint-disable-next-line @typescript-eslint/ban-types
export type FixtureAction<Context = FixtureContext> = (
  ctx: Context
) => Promise<unknown>;

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export type ReturnsString<Context = FixtureContext> = (
  ctx: Context
) => Promise<string> | string;

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export interface MockFixture<Context = FixtureContext> {
  name: 'root' | 'describe-root' | string | ReturnsString<Context> | symbol;
  description: string | ReturnsString<Context>;
  setup?: FixtureAction<Context>;
  teardown?: FixtureAction<Context>;
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export function rootFixture(): MockFixture {
  return {
    name: 'root', // ? If first isn't named root, root used automatically
    description: (ctx) =>
      `creating a unique root directory${
        ctx.options.performCleanup && ' (will be deleted after all tests complete)'
      }`,
    setup: async (ctx) => {
      ctx.root = uniqueFilename(tmpdir(), ctx.testIdentifier);

      await run('mkdir', ['-p', ctx.root], { reject: true });
      await run('mkdir', ['-p', 'src'], { cwd: ctx.root, reject: true });
    },
    teardown: async (ctx) =>
      ctx.options.performCleanup && run('rm', ['-rf', ctx.root], { reject: true })
  };
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export function dummyNpmPackageFixture(): MockFixture {
  return {
    name: 'dummy-npm-package',
    description: 'creating package.json file and node_modules subdirectory',
    setup: async (ctx) => {
      await Promise.all([
        writeFile(
          `${ctx.root}/package.json`,
          (ctx.fileContents['package.json'] =
            ctx.fileContents['package.json'] || '{"name":"dummy-pkg"}')
        ),
        run('mkdir', ['-p', 'node_modules'], { cwd: ctx.root, reject: true })
      ]);

      if (pkgName.includes('/')) {
        await run('mkdir', ['-p', pkgName.split('/')[0]], {
          cwd: `${ctx.root}/node_modules`,
          reject: true
        });
      }
    }
  };
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export function npmLinkSelfFixture(): MockFixture {
  return {
    name: 'npm-link-self',
    description:
      'soft-linking project repo into node_modules to emulate package installation',
    setup: async (ctx) => {
      await run('ln', ['-s', resolve(`${__dirname}/..`), pkgName], {
        cwd: `${ctx.root}/node_modules`,
        reject: true
      });
    }
  };
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export function webpackTestFixture(): MockFixture {
  return {
    name: 'webpack-test',
    description: 'setting up webpack jest integration test',
    setup: async (ctx) => {
      if (typeof ctx.options.webpackVersion != 'string') {
        throw new GuruMeditationError(
          'invalid or missing options.webpackVersion, expected string'
        );
      }

      const indexPath = Object.keys(ctx.fileContents).find((path) =>
        /^src\/index\.(((c|m)?js)|ts)x?$/.test(path)
      );

      if (!indexPath)
        throw new GuruMeditationError(
          'could not find initial contents for src/index file'
        );

      if (!ctx.fileContents['webpack.config.js'])
        throw new GuruMeditationError(
          'could not find initial contents for webpack.config.js file'
        );

      await Promise.all([
        writeFile(`${ctx.root}/${indexPath}`, ctx.fileContents[indexPath]),
        writeFile(
          `${ctx.root}/webpack.config.js`,
          ctx.fileContents['webpack.config.js']
        )
      ]);

      ctx.treeOutput = await getTreeOutput(ctx);

      await run(
        'npm',
        ['install', `webpack@${ctx.options.webpackVersion}`, 'webpack-cli'],
        {
          cwd: ctx.root,
          reject: true
        }
      );

      await run('npx', ['webpack'], { cwd: ctx.root, reject: true });

      const { exitCode, stdout, stderr } = await run('node', [
        `${ctx.root}/dist/index.js`
      ]);

      ctx.testResult = {
        exitCode,
        stdout,
        stderr
      };
    }
  };
}

async function getTreeOutput(ctx: FixtureContext) {
  return (await execa('tree', ['-a'], { cwd: ctx.root })).stdout;
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export function nodeImportTestFixture(): MockFixture {
  return {
    name: 'node-import-test',
    description: 'setting up node import jest integration test',
    setup: async (ctx) => {
      const indexPath = Object.keys(ctx.fileContents).find((path) =>
        /^src\/index\.(((c|m)?js)|ts)x?$/.test(path)
      );

      if (!indexPath)
        throw new GuruMeditationError(
          'could not find initial contents for src/index file'
        );

      await writeFile(`${ctx.root}/${indexPath}`, ctx.fileContents[indexPath]);

      ctx.treeOutput = await getTreeOutput(ctx);

      const { exitCode, stdout, stderr } = await run(
        'node',
        ['--experimental-json-modules', indexPath],
        { cwd: ctx.root }
      );

      ctx.testResult = {
        exitCode,
        stdout,
        stderr
      };
    }
  };
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export function gitRepositoryFixture(): MockFixture {
  return {
    name: 'git-repository',
    description: 'configuring fixture root to be a git repository',
    setup: async (ctx) => {
      if (ctx.options.setupGit && typeof ctx.options.setupGit != 'function') {
        throw new GuruMeditationError(
          'invalid or missing options.setupGit, expected function'
        );
      }

      ctx.git = gitFactory({ baseDir: ctx.root });

      await (ctx.options.setupGit
        ? ctx.options.setupGit(ctx.git)
        : ctx.git
            .init()
            .addConfig('user.name', 'fake-user')
            .addConfig('user.email', 'fake@email'));
    }
  };
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export function dummyDirectoriesFixture(): MockFixture {
  return {
    name: 'dummy-directories',
    description: 'creating dummy directories under fixture root',
    setup: async (ctx) => {
      if (!Array.isArray(ctx.options.directoryPaths)) {
        throw new GuruMeditationError(
          'invalid or missing options.directoryPaths, expected array'
        );
      }

      await Promise.all(
        ctx.options.directoryPaths.map((path) =>
          run('mkdir', ['-p', path], { cwd: ctx.root, reject: true })
        )
      );
    }
  };
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
export function dummyFilesFixture(): MockFixture {
  return {
    name: 'dummy-files',
    description: 'creating dummy files under fixture root',
    setup: async (ctx) => {
      await Promise.all(
        Object.entries(ctx.fileContents).map(async ([path, contents]) => {
          const fullPath = `${ctx.root}/${path}`;
          await accessFile(fullPath).then(
            () =>
              debug(`skipped creating dummy file: file already exists at ${path}`),
            async () => {
              debug(`creating dummy file "${path}" with contents:`);
              debug.extend('contents >')(contents);
              await writeFile(fullPath, (ctx.fileContents[path] = contents));
            }
          );
        })
      );
    }
  };
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ below)
// ? If a fixture w/ this name isn't included, it's appended
// ! This fixture, when included, is always run even when errors occur!
export function describeRootFixture(): MockFixture {
  return {
    name: 'describe-root',
    description: 'outputting debug information about environment',
    setup: async (ctx) => {
      ctx.debug('test identifier: %O', ctx.testIdentifier);
      ctx.debug('root: %O', ctx.root);
      ctx.debug(ctx.treeOutput || (await getTreeOutput(ctx)));
      ctx.debug('per-file contents: %O', ctx.fileContents);
    }
  };
}

// TODO: XXX: make this into a separate (mock-fixture) package
export async function withMockedFixture<
  // eslint-disable-next-line @typescript-eslint/ban-types
  CustomOptions extends Record<string, unknown> = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  CustomContext extends Record<string, unknown> = {}
>({
  fn,
  testIdentifier,
  options
}: {
  fn: FixtureAction<
    FixtureContext<
      FixtureOptions & Partial<Record<string, unknown> & CustomOptions>
    > &
      CustomContext
  >;
  testIdentifier: string;
  options?: Partial<FixtureOptions & CustomOptions>;
}) {
  type CustomizedFixtureOptions = FixtureOptions &
    Partial<Record<string, unknown> & CustomOptions>;
  type CustomizedFixtureContext = FixtureContext<CustomizedFixtureOptions> &
    CustomContext;
  type CustomizedMockFixture = MockFixture<CustomizedFixtureContext>;

  const testSymbol = Symbol('test');
  const finalOptions = {
    performCleanup: true,
    use: [] as MockFixture[],
    initialFileContents: {},
    ...options
  } as CustomizedFixtureOptions & { use: CustomizedMockFixture[] };

  // TODO:
  // @ts-expect-error: TODO: fix this
  const ctx = {
    root: '',
    testIdentifier,
    debug,
    using: [] as MockFixture[],
    options: finalOptions,
    fileContents: { ...finalOptions.initialFileContents }
  } as CustomizedFixtureContext & { using: CustomizedMockFixture[] };

  if (finalOptions.use) {
    if (finalOptions.use?.[0]?.name != 'root') ctx.using.push(rootFixture());
    ctx.using = [...ctx.using, ...finalOptions.use];
    // ? `describe-root` fixture doesn't have to be the last one, but a fixture
    // ? with that name must be included at least once
    if (!finalOptions.use.find((f) => f.name == 'describe-root'))
      ctx.using.push(describeRootFixture());
  } else ctx.using = [rootFixture(), describeRootFixture()];

  ctx.using.push({
    name: testSymbol,
    description: '',
    setup: fn
  });

  let ranDescribe = false;
  const cleanupFunctions: NonNullable<CustomizedMockFixture['teardown']>[] = [];

  const setupDebugger = async (fixture: CustomizedMockFixture, error = false) => {
    const toString = async (
      p: CustomizedMockFixture['name'] | CustomizedMockFixture['description']
    ) =>
      typeof p == 'function' ? p(ctx) : typeof p == 'string' ? p : ':impossible:';
    const name = await toString(fixture.name.toString());
    const desc = await toString(fixture.description);
    const dbg = debug.extend(error ? `${name}:<error>` : name);
    ctx.debug = dbg;
    dbg(desc);
  };

  /*eslint-disable no-await-in-loop */
  try {
    for (const mockFixture of ctx.using) {
      if (mockFixture.name == testSymbol) {
        ctx.debug = debug;
        debug('executing test callback');
      } else {
        await setupDebugger(mockFixture);
        if (mockFixture.teardown) cleanupFunctions.push(mockFixture.teardown);
      }

      mockFixture.setup
        ? await mockFixture.setup(ctx)
        : ctx.debug('(warning: mock fixture has no setup function)');

      if (mockFixture.name == 'describe-root') ranDescribe = true;
    }
  } catch (e) {
    ctx.debug.extend('<error>')('exception occurred: %O', e);
    throw e;
  } finally {
    if (!ranDescribe) {
      const fixture = describeRootFixture();
      await setupDebugger(fixture, true);
      await fixture.setup?.(ctx);
    }

    ctx.debug = debug.extend('<cleanup>');

    for (const cfn of cleanupFunctions.reverse()) {
      await cfn(ctx).catch((e) =>
        ctx.debug(
          `ignored exception in teardown function: ${
            e?.message || e.toString() || '<no error message>'
          }`
        )
      );
    }
  }
  /*eslint-enable no-await-in-loop */
}

// TODO: XXX: make this into a separate (mock-fixture) package (along w/ above)
export function mockFixtureFactory<
  // eslint-disable-next-line @typescript-eslint/ban-types
  CustomOptions extends Record<string, unknown> = {},
  // eslint-disable-next-line @typescript-eslint/ban-types
  CustomContext extends Record<string, unknown> = {}
>(testIdentifier: string, options?: Partial<FixtureOptions & CustomOptions>) {
  return (
    fn: FixtureAction<
      FixtureContext<
        FixtureOptions & Partial<Record<string, unknown> & CustomOptions>
      > &
        CustomContext
    >
  ) =>
    withMockedFixture<CustomOptions, CustomContext>({ fn, testIdentifier, options });
}
