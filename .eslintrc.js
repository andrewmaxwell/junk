module.exports = {
  parser: 'babel-eslint',
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module',
    ecmaFeatures: {jsx: true},
  },
  env: {browser: true, es6: true, node: true, mocha: true},
  extends: ['eslint:recommended', 'prettier', 'plugin:react/recommended'],
  plugins: ['prettier', 'react'],
  rules: {
    'no-console': 'off',
    'prettier/prettier': ['warn', {singleQuote: true, bracketSpacing: false}],
    'dot-notation': 'warn',
    'quote-props': ['warn', 'as-needed'],
    'arrow-body-style': ['warn', 'as-needed'],
    'object-shorthand': 'warn',
    'sonarjs/cognitive-complexity': 'off',
    'react/prop-types': 'off',
    'no-use-before-define': 'warn',
    'react/display-name': 'off',
    'no-prototype-builtins': 'off',
  },
  settings: {react: {version: 'detect'}},
  // globals: Object.keys(require('ramda')).reduce((acc, key) => {
  //   acc[key] = 'readonly'
  //   return acc;
  // }, {})
};
