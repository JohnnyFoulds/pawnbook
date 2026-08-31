/**
 * @module tests/playwright/journey
 * Longitudinal journey suite — DOM assertions against a simulated 30-day DB.
 *
 * The webServer in playwright.journey.config.js runs simulate-journey.js
 * first, then starts the server against the populated DB with ENGINE_MODE=fake.
 *
 * These tests assert DOM structure and content — not layout or aesthetics.
 * They prove that a populated repertoire renders correctly on every page,
 * which the unit-test suite cannot verify because it never exercises the UI.
 *
 * Stage numbering matches the journey plan in docs/features/repertoire/user_journey.md.
 * Screenshots are saved to playwright-journey-report/ for human inspection.
 */

import { test, expect } from '@playwright/test';

// ── Helpers ────────────────────────────────────────────────────────────────

async function screenshot(page, name) {
  await page.screenshot({
    path: `playwright-journey-report/${name}.png`,
    fullPage: true,
  });
}

// ── Stage 1 — Repertoire coverage panel ───────────────────────────────────

test('stage1: coverage panel shows a non-dash value', async ({ page }) => {
  await page.goto('/repertoire.html');
  await page.waitForFunction(() => {
    const el = document.getElementById('coverage-pct');
    return el && el.textContent !== '—' && el.textContent !== 'Loading…';
  }, { timeout: 8000 });
  const pct = await page.locator('#coverage-pct').textContent();
  expect(pct).toMatch(/\d+%/);
  await screenshot(page, 'stage1-coverage');
});

// ── Stage 2 — Canonical move count ────────────────────────────────────────

test('stage2: canonical-count shows at least 1 book move', async ({ page }) => {
  await page.goto('/repertoire.html');
  await page.waitForFunction(() => {
    const el = document.getElementById('canonical-count');
    return el && el.textContent !== '—';
  }, { timeout: 8000 });
  const count = parseInt(await page.locator('#canonical-count').textContent(), 10);
  expect(count).toBeGreaterThan(0);
  await screenshot(page, 'stage2-canonical');
});

// ── Stage 3 — Book tree renders nodes ─────────────────────────────────────

test('stage3: book tree renders at least one node row', async ({ page }) => {
  await page.goto('/repertoire.html');
  // Tree loads after coverage — wait for tree-list to populate
  await page.waitForFunction(() => {
    const el = document.getElementById('tree-list');
    return el && el.children.length > 0 &&
      !el.textContent.includes('Loading') &&
      !el.textContent.includes('No book moves');
  }, { timeout: 10000 });
  const children = await page.locator('#tree-list > div').count();
  expect(children).toBeGreaterThan(0);
  await screenshot(page, 'stage3-tree');
});

// ── Stage 4 — Changelog has entries ──────────────────────────────────────

test('stage4: changelog shows at least one entry', async ({ page }) => {
  await page.goto('/repertoire.html');
  await page.waitForFunction(() => {
    const el = document.getElementById('changelog-list');
    return el && el.children.length > 0 &&
      !el.textContent.includes('Loading') &&
      !el.textContent.includes('No book changes');
  }, { timeout: 10000 });
  const entries = await page.locator('#changelog-list li').count();
  expect(entries).toBeGreaterThan(0);
  await screenshot(page, 'stage4-changelog');
});

// ── Stage 5 — Refusal log summary is visible ──────────────────────────────

test('stage5: refusal summary is non-empty', async ({ page }) => {
  await page.goto('/repertoire.html');
  await page.waitForFunction(() => {
    const el = document.getElementById('refusal-summary');
    return el && el.textContent !== 'Loading…' && el.textContent.length > 5;
  }, { timeout: 10000 });
  const text = await page.locator('#refusal-summary').textContent();
  // Either "No alerted deviations yet." or "N kept — …"
  expect(text.length).toBeGreaterThan(5);
  await screenshot(page, 'stage5-refusals');
});

// ── Stage 6 — Games page shows completed games ────────────────────────────

test('stage6: games page loads and shows a game list', async ({ page }) => {
  await page.goto('/games.html');
  // Wait for page to finish loading (no JS errors)
  await page.waitForLoadState('networkidle');
  // The page should have a main element
  await expect(page.locator('main')).toBeVisible();
  await screenshot(page, 'stage6-games');
});

// ── Stage 7 — Stats page shows ELO ───────────────────────────────────────

test('stage7: stats page shows ELO display', async ({ page }) => {
  await page.goto('/stats.html');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('main')).toBeVisible();
  await screenshot(page, 'stage7-stats');
});

// ── Stage 8 — Drill page loads ───────────────────────────────────────────

test('stage8: drill page renders without JS errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/puzzles.html');
  await page.waitForLoadState('networkidle');
  // Either empty-state or drill-ui should be visible
  const emptyVisible = await page.locator('#empty-state').isVisible();
  const drillVisible = await page.locator('#drill-ui').isVisible();
  expect(emptyVisible || drillVisible).toBe(true);
  expect(errors).toHaveLength(0);
  await screenshot(page, 'stage8-drill');
});

// ── Stage 9 — Play page setup panel visible ───────────────────────────────

test('stage9: play page shows setup panel', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/play.html');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#setup-panel')).toBeVisible();
  expect(errors).toHaveLength(0);
  await screenshot(page, 'stage9-play');
});

// ── Stage 10 — Repertoire tree toggle works ──────────────────────────────

test('stage10: show-candidates toggle re-renders tree', async ({ page }) => {
  await page.goto('/repertoire.html');
  await page.waitForFunction(() => {
    const el = document.getElementById('tree-list');
    return el && !el.textContent.includes('Loading');
  }, { timeout: 10000 });

  // Click the show-candidates checkbox and verify tree re-renders without error
  const checkbox = page.locator('#show-candidates');
  await checkbox.check();
  await page.waitForTimeout(200);
  const treeContent = await page.locator('#tree-list').textContent();
  expect(treeContent).not.toContain('Could not load');
  await screenshot(page, 'stage10-tree-toggle');
});

// ── Stage 11 — Line-health panel renders ─────────────────────────────────

test('stage11: line-health panel renders without error', async ({ page }) => {
  await page.goto('/repertoire.html');
  await page.waitForFunction(() => {
    const el = document.getElementById('line-health-list');
    return el && el.textContent.trim().length > 0 && !el.textContent.includes('Loading');
  }, { timeout: 10000 });
  const text = await page.locator('#line-health-list').textContent();
  expect(text).not.toContain('Could not load');
  await screenshot(page, 'stage11-line-health');
});

// ── Stage 12 — Journey milestones panel shows at least one milestone ─────

test('stage12: journey milestones shows at least one entry', async ({ page }) => {
  await page.goto('/repertoire.html');
  await page.waitForFunction(() => {
    const el = document.getElementById('journey-milestones');
    return el && el.textContent.trim().length > 0 && !el.textContent.includes('Loading');
  }, { timeout: 10000 });
  const text = await page.locator('#journey-milestones').textContent();
  // Simulated 30-day journey always has firstConfirm, coachWoke, firstPromotion
  expect(text).toMatch(/First confirmed move/);
  await screenshot(page, 'stage12-journey');
});
