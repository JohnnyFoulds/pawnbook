import { defineConfig, devices } from '@playwright/test';

// E2E tests run against a dedicated test server on port 3001 with a fresh
// database so stale in-progress games or prior test data never pollute runs.
const TEST_PORT = 3001;
const TEST_DATA_DIR = './test-data';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,            // one browser at a time — we share one test server
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    ...devices['Desktop Chrome'],
    headless: true,
  },
  webServer: {
    // Always start fresh: wipe test-data so no stale in_progress games exist.
    command: `rm -rf ${TEST_DATA_DIR} && node src/server.js`,
    url: `http://localhost:${TEST_PORT}/api/state`,
    reuseExistingServer: false,
    timeout: 15_000,
    env: {
      PORT: String(TEST_PORT),
      DATA_DIR: TEST_DATA_DIR,
      ENGINE_MODE: 'native',
      LOG_LEVEL: 'warn',   // reduce noise in test output
      NODE_ENV: 'test',
    },
  },
});
