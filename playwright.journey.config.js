/**
 * @module playwright.journey.config
 * Playwright config for the longitudinal journey suite.
 *
 * Distinct from playwright.config.js (the regular E2E suite):
 *   - Uses ENGINE_MODE=fake so no real engines are spawned
 *   - Runs simulate-journey.js first to populate a throwaway DB
 *   - Never touches data/chess.db
 *
 * Usage:
 *   npx playwright test -c playwright.journey.config.js
 *
 * Or with a pre-built DB:
 *   JOURNEY_DB=/tmp/my-journey.db npx playwright test -c playwright.journey.config.js
 */

import { defineConfig, devices } from '@playwright/test';

const JOURNEY_PORT = 3002;
// JOURNEY_DB is the path to the SQLite file; DATA_DIR is its parent directory.
const JOURNEY_DB   = process.env.JOURNEY_DB ?? '/tmp/pawnbook-journey/chess.db';
const JOURNEY_DIR  = JOURNEY_DB.replace(/\/[^/]+$/, '');

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-journey-report', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${JOURNEY_PORT}`,
    ...devices['Desktop Chrome'],
    headless: true,
  },
  webServer: {
    // Simulate the 30-day journey into JOURNEY_DB, then start the server against it.
    command: `node scripts/simulate-journey.js --out ${JOURNEY_DB} && node src/server.js`,
    url: `http://localhost:${JOURNEY_PORT}/api/state`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT:         String(JOURNEY_PORT),
      DATA_DIR:     JOURNEY_DIR,
      ENGINE_MODE:  'fake',
      NODE_ENV:     'test',
    },
  },
});
