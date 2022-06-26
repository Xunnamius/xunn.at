'use strict';

// This webpack config is used to transpile src to dist, compile externals,
// compile executables, etc

const { EnvironmentPlugin, DefinePlugin, BannerPlugin } = require('webpack');
const { verifyEnvironment } = require('./expect-env');
const nodeExternals = require('webpack-node-externals');
const debug = require('debug')(`${require('./package.json').name}:webpack-config`);

const IMPORT_ALIASES = {
  universe: `${__dirname}/src/`,
  multiverse: `${__dirname}/lib/`,
  testverse: `${__dirname}/test/`,
  externals: `${__dirname}/external-scripts/`,
  types: `${__dirname}/types/`,
  package: `${__dirname}/package.json`,
  // ? These are used at various points (including at compile time by
  // ? Next.js) to get mongo schema configuration and/or test dummy data.
  // ! Must be defined if using @xunnamius/mongo-schema
  'configverse/get-schema-config': `${__dirname}/src/backend/db.ts`,
  // ! Must be defined if using @xunnamius/mongo-test
  'configverse/get-dummy-data': `${__dirname}/test/db.ts`
};

let sanitizedEnv = {};
let { NODE_ENV: nodeEnv, ...sanitizedProcessEnv } = {
  ...process.env,
  NODE_ENV: 'production'
};

try {
  require('fs').accessSync('.env');
  const { NODE_ENV: forceEnv, ...parsedEnv } = require('dotenv').config().parsed;
  nodeEnv = forceEnv || nodeEnv;
  sanitizedEnv = parsedEnv;
  debug(`NODE_ENV: ${nodeEnv}`);
  debug('sanitized .env vars: %O', sanitizedEnv);
} catch (e) {
  debug(`.env support disabled; reason: ${e}`);
}

debug('sanitized process env: %O', sanitizedProcessEnv);
verifyEnvironment();

const envPlugins = [
  // ? NODE_ENV is not a "default" (unlike below) but an explicit overwrite
  new DefinePlugin({
    'process.env.NODE_ENV': JSON.stringify(nodeEnv)
  }),
  // ? Load our .env results as the defaults (overridden by process.env)
  new EnvironmentPlugin({ ...sanitizedEnv, ...sanitizedProcessEnv }),
  // ? Create shim process.env for undefined vars
  // ! The above already replaces all process.env.X occurrences in the code
  // ! first, so plugin order is important here
  new DefinePlugin({ 'process.env': '{}' })
];

const externals = [
  nodeExternals(),
  ({ request }, cb) =>
    // ? Externalize all .json imports (required as commonjs modules)
    /\.json$/.test(request) ? cb(null, `commonjs ${request}`) : cb()
];

/* const libConfig = {
  name: 'lib',
  mode: 'production',
  target: 'node',
  node: false,

  entry: `${__dirname}/src/index.ts`,

  output: {
    filename: 'index.js',
    path: `${__dirname}/dist`,
    // ! ▼ Only required for libraries
    // ! ▼ Note: ESM outputs are handled by Babel ONLY!
    libraryTarget: 'commonjs2'
  },

  externals,
  externalsPresets: { node: true },

  stats: {
    orphanModules: true,
    providedExports: true,
    usedExports: true,
    errorDetails: true
  },

  resolve: {
    extensions: ['.ts', '.wasm', '.mjs', '.cjs', '.js', '.json'],
    // ! If changed, also update these aliases in tsconfig.json,
    // ! jest.config.js, next.config.ts, and .eslintrc.js
    alias: IMPORT_ALIASES
  },
  module: {
    rules: [{ test: /\.(ts|js)x?$/, loader: 'babel-loader', exclude: /node_modules/ }]
  },
  optimization: { usedExports: true },
  plugins: [...envPlugins]
}; */

const externalsConfig = {
  name: 'externals',
  mode: 'production',
  target: 'node',
  node: false,

  entry: {
    'ban-hammer': `${__dirname}/external-scripts/ban-hammer.ts`,
    'prune-data': `${__dirname}/external-scripts/prune-data.ts`
    // 'initialize-data': `${__dirname}/external-scripts/initialize-data/index.ts`,
    // 'simulate-activity': `${__dirname}/external-scripts/simulate-activity/index.ts`
  },

  output: {
    filename: '[name].js',
    path: `${__dirname}/external-scripts/bin`
  },

  externals,
  externalsPresets: { node: true },

  stats: {
    orphanModules: true,
    providedExports: true,
    usedExports: true,
    errorDetails: true
  },

  resolve: {
    extensions: ['.ts', '.wasm', '.mjs', '.cjs', '.js', '.json'],
    // ! If changed, also update these aliases in tsconfig.json,
    // ! jest.config.js, next.config.ts, and .eslintrc.js
    alias: IMPORT_ALIASES
  },
  module: {
    rules: [
      {
        test: /\.(ts|js)x?$/,
        exclude: /node_modules/,
        use: 'babel-loader'
      }
    ]
  },
  optimization: { usedExports: true },
  plugins: [
    ...envPlugins,
    // * ▼ For non-bundled externals, make entry file executable w/ shebang
    new BannerPlugin({ banner: '#!/usr/bin/env node', raw: true, entryOnly: true })
  ]
};

/* const cliConfig = {
  name: 'cli',
  mode: 'production',
  target: 'node',
  node: false,

  entry: `${__dirname}/src/cli.ts`,

  output: {
    filename: 'cli.js',
    path: `${__dirname}/dist`
  },

  externals,
  externalsPresets: { node: true },

  stats: {
    orphanModules: true,
    providedExports: true,
    usedExports: true,
    errorDetails: true
  },

  resolve: {
    extensions: ['.ts', '.wasm', '.mjs', '.cjs', '.js', '.json'],
    // ! If changed, also update these aliases in tsconfig.json,
    // ! jest.config.js, next.config.ts, and .eslintrc.js
    alias: IMPORT_ALIASES
  },
  module: {
    rules: [{ test: /\.(ts|js)x?$/, loader: 'babel-loader', exclude: /node_modules/ }]
  },
  optimization: { usedExports: true },
  plugins: [
    ...envPlugins,
    // * ▼ For bundled CLI applications, make entry file executable w/ shebang
    new BannerPlugin({ banner: '#!/usr/bin/env node', raw: true, entryOnly: true })
  ]
}; */

module.exports = [/*libConfig,*/ externalsConfig /*, cliConfig*/];
debug('exports: %O', module.exports);
