// * https://www.npmjs.com/package/npm-check-updates#configuration-files

// TODO: remove outdated deps and exceptions (below) when externalizing libs to
// TODO: packages

module.exports = {
  reject: [
    // ? Pin the CJS version of execa
    'execa',
    // ? Pin the non-broken version of unfetch
    'unfetch',
    // ? Pin the non-streamx version of tar-stream
    'tar-stream',
    // ? Pin the CJS version of node-fetch (and its types)
    'node-fetch',
    '@types/node-fetch',
    // ? Pin the CJS version of find-up
    'find-up'
  ]
};
