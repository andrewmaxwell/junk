module.exports = {
  parser: 'babel-eslint',
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module'
  },
  env: {browser: true, es6: true},
  extends: [
    'eslint:recommended',
    'prettier'
  ],
  plugins: ['prettier'],
  rules: {
    'no-console': 'off',
    'prettier/prettier': ['error', {singleQuote: true, bracketSpacing: false}],
    'dot-notation': 'error',
    'quote-props': ['error', 'as-needed'],
    'arrow-body-style': ['error', 'as-needed'],
    'object-shorthand': 'error'
  }
};
