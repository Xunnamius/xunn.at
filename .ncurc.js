// * https://www.npmjs.com/package/npm-check-updates#configuration-files

module.exports = {
  reject: [
    // ? Pin eslint to ^7 until eslint-config-next updates its peer deps
    'eslint',
    // ? Pin CJS version
    'execa'
  ]
};
