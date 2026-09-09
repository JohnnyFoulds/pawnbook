import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import-x';
import security from 'eslint-plugin-security';

export default [
  js.configs.recommended,
  {
    ignores: ['node_modules/', 'coverage/', 'public/js/lib/', 'site/.vitepress/dist/', 'playwright-journey-report/', 'ux-audit-screenshots/'],
  },
  // Node.js: server, tui, tests, scripts
  {
    files: ['src/**/*.js', 'tui/**/*.js', 'bin/**/*.js', 'tests/**/*.js', 'scripts/**/*.js', 'scripts/**/*.mjs', '*.js'],
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
      // All external input crosses a Zod schema at the interface layer before it
      // reaches domain/adapters code, and dynamic lookups (EPD keys, move maps)
      // are core to the chess domain. The rule's false-positive rate here makes
      // real warnings indistinguishable from noise.
      'security/detect-object-injection': 'off',
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
      },
    },
    plugins: {
      security,
    },
    rules: {
      ...security.configs.recommended.rules,
      // Browser code reads indexed data keyed by validated API responses;
      // see the Node block rationale for the object-injection rule.
      'security/detect-object-injection': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
    },
  },
  // Playwright journey tests — waitForFunction callbacks execute in browser context
  {
    files: ['tests/playwright/**/*.js', 'tests/e2e/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
];
