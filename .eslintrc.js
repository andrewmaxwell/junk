module.exports = {
  parser: 'babel-eslint',
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module',
    ecmaFeatures: {jsx: true}
  },
  env: {browser: true, es6: true, node: true},
  extends: [
    'eslint:recommended',
    'prettier',
    'plugin:react/recommended'
  ],
  plugins: ['prettier', 'react'],
  rules: {
    'no-console': 'off',
    'prettier/prettier': ['error', {singleQuote: true, bracketSpacing: false}],
    'dot-notation': 'error',
    'quote-props': ['error', 'as-needed'],
    'arrow-body-style': ['error', 'as-needed'],
    'object-shorthand': 'error'
  }
};
