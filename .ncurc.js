// * https://www.npmjs.com/package/npm-check-updates#configuration-files

module.exports = {
  reject: [
    // ? Pin the CJS version of execa
    'execa',
    // ? Pin the CJS version of node-fetch (and its types)
    'node-fetch',
    '@types/node-fetch'
  ]
};
