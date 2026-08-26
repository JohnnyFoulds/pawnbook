import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import-x';
import security from 'eslint-plugin-security';

export default [
  js.configs.recommended,
  {
    ignores: ['node_modules/', 'coverage/', 'public/js/lib/'],
  },
  // Node.js: server, tui, tests, scripts
  {
    files: ['src/**/*.js', 'tui/**/*.js', 'bin/**/*.js', 'tests/**/*.js', 'scripts/**/*.js', '*.js'],
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
  },
  // Browser: public/ ES modules (excluding vendor lib/)
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        Chessboard: 'readonly',
      },
    },
    plugins: {
      security,
    },
    rules: {
      ...security.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
];
