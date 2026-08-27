import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
    headless: true,
  },
  webServer: {
    command: 'node src/server.js',
    url: 'http://localhost:3000/api/state',
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
