import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import security from 'eslint-plugin-security';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      import: importPlugin,
      security,
    },
    rules: {
      ...security.configs.recommended.rules,
      'import/order': ['error', { 'newlines-between': 'always' }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
    ignores: ['node_modules/', 'coverage/', 'public/js/lib/'],
  },
];
