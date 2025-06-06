import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-plugin-prettier';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: {prettier},

    languageOptions: {
      globals: globals.browser,
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },

    rules: {
      'prettier/prettier': [
        'warn',
        {singleQuote: true, bracketSpacing: false, endOfLine: 'auto'},
      ],
      'dot-notation': 'warn',
      'quote-props': ['warn', 'as-needed'],
      'arrow-body-style': ['warn', 'as-needed'],
      'object-shorthand': 'warn',
      'no-use-before-define': 'warn',
      'react/display-name': 'off',
      'react/prop-types': 'off',
      'no-prototype-builtins': 'off',
      'no-nested-ternary': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
