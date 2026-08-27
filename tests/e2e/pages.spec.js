/**
 * E2E tests for all pawnbook pages.
 * Drives the browser via Playwright, captures console errors, network failures,
 * and checks that each page's key elements are present and functional.
 */

import { test, expect } from '@playwright/test';

// Collect console errors and failed network requests for each test.
function capturePageErrors(page) {
  const errors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} → ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      failedRequests.push(`${res.request().method()} ${res.url()} → HTTP ${res.status()}`);
    }
  });

  return { errors, failedRequests };
}

// ── Dashboard ──────────────────────────────────────────────────────────────

test.describe('Dashboard (index.html)', () => {
  test('loads without JS errors', async ({ page }) => {
    const { errors, failedRequests } = capturePageErrors(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors, `JS errors: ${errors.join('\n')}`).toEqual([]);
    expect(failedRequests, `Failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
  });

  test('shows ELO tile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const elo = page.locator('#elo-value');
    await expect(elo).toBeVisible();
    const text = await elo.textContent();
    expect(text).toBeTruthy();
  });

  test('shows due-count tile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#due-value')).toBeVisible();
  });

  test('shows recent games table', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#recent-games-body')).toBeVisible();
  });

  test('navigation links are present', async ({ page }) => {
    await page.goto('/');
    const count = await page.locator('a[href*="play"]').count();
    expect(count).toBeGreaterThan(0);
  });
});

// ── Play page ──────────────────────────────────────────────────────────────

test.describe('Play page (play.html)', () => {
  test('loads without JS errors', async ({ page }) => {
    const { errors, failedRequests } = capturePageErrors(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    expect(errors, `JS errors: ${errors.join('\n')}`).toEqual([]);
    expect(failedRequests, `Failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
  });

  test('setup panel is visible on load', async ({ page }) => {
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#setup-panel')).toBeVisible();
    await expect(page.locator('#game-area')).toBeHidden();
  });

  test('opponent chips are rendered', async ({ page }) => {
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    const chips = page.locator('.opponent-chip');
    await expect(chips.first()).toBeVisible();
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
  });

  test('can select an opponent and start button is present', async ({ page }) => {
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    const firstChip = page.locator('.opponent-chip').first();
    await firstChip.click();
    await expect(page.locator('#start-btn')).toBeVisible();
  });

  test('color chips are present', async ({ page }) => {
    await page.goto('/play.html');
    await expect(page.locator('[data-color]').first()).toBeVisible();
  });

  test('time control chips are present', async ({ page }) => {
    await page.goto('/play.html');
    await expect(page.locator('[data-tc]').first()).toBeVisible();
  });
});

// ── Review page ────────────────────────────────────────────────────────────

test.describe('Review page (review.html)', () => {
  test('loads without JS errors (no game id)', async ({ page }) => {
    const { errors, failedRequests } = capturePageErrors(page);
    await page.goto('/review.html');
    await page.waitForLoadState('networkidle');
    expect(errors, `JS errors: ${errors.join('\n')}`).toEqual([]);
    // No game specified — should show fallback text, not crash
    const meta = page.locator('#game-meta');
    await expect(meta).toBeVisible();
    const text = await meta.textContent();
    expect(text.length).toBeGreaterThan(0);
  });

  test('shows fallback when no game param', async ({ page }) => {
    await page.goto('/review.html');
    await page.waitForLoadState('networkidle');
    const meta = page.locator('#game-meta');
    await expect(meta).toContainText('No game specified');
  });
});

// ── Quiz page ──────────────────────────────────────────────────────────────

test.describe('Quiz page (quiz.html)', () => {
  test('loads without JS errors', async ({ page }) => {
    const { errors, failedRequests } = capturePageErrors(page);
    await page.goto('/quiz.html');
    await page.waitForLoadState('networkidle');
    expect(errors, `JS errors: ${errors.join('\n')}`).toEqual([]);
  });
});

// ── Puzzles / Drill page ───────────────────────────────────────────────────

test.describe('Puzzles/Drill page (puzzles.html)', () => {
  test('loads without JS errors', async ({ page }) => {
    const { errors, failedRequests } = capturePageErrors(page);
    await page.goto('/puzzles.html');
    await page.waitForLoadState('networkidle');
    expect(errors, `JS errors: ${errors.join('\n')}`).toEqual([]);
    expect(failedRequests, `Failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
  });

  test('shows empty state when no cards due', async ({ page }) => {
    await page.goto('/puzzles.html');
    await page.waitForLoadState('networkidle');
    // Either drill-ui is visible (cards exist) or empty-state is visible (no cards)
    const emptyState = page.locator('#empty-state');
    const drillUi = page.locator('#drill-ui');
    const emptyVisible = await emptyState.isVisible();
    const drillVisible = await drillUi.isVisible();
    expect(emptyVisible || drillVisible).toBeTruthy();
  });
});

// ── Games page ─────────────────────────────────────────────────────────────

test.describe('Games page (games.html)', () => {
  test('loads without JS errors', async ({ page }) => {
    const { errors, failedRequests } = capturePageErrors(page);
    await page.goto('/games.html');
    await page.waitForLoadState('networkidle');
    expect(errors, `JS errors: ${errors.join('\n')}`).toEqual([]);
    expect(failedRequests, `Failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
  });
});

// ── Stats page ─────────────────────────────────────────────────────────────

test.describe('Stats page (stats.html)', () => {
  test('loads without JS errors', async ({ page }) => {
    const { errors, failedRequests } = capturePageErrors(page);
    await page.goto('/stats.html');
    await page.waitForLoadState('networkidle');
    expect(errors, `JS errors: ${errors.join('\n')}`).toEqual([]);
    expect(failedRequests, `Failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
  });

  test('shows ELO value', async ({ page }) => {
    await page.goto('/stats.html');
    await page.waitForLoadState('networkidle');
    const elo = page.locator('#elo-val');
    await expect(elo).toBeVisible();
    await expect(elo).not.toBeEmpty();
  });
});

// ── API shape validation ───────────────────────────────────────────────────

test.describe('API shape', () => {
  test('/api/state has all fields consumed by dashboard', async ({ request }) => {
    const res = await request.get('/api/state');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('elo');
    expect(body).toHaveProperty('dueCount');
    expect(body).toHaveProperty('showStreak');
    expect(body).toHaveProperty('streak');
    // dashboard.js reads these
    expect(body).toHaveProperty('gamesPlayed');
    expect(body).toHaveProperty('eloHistory');
    expect(body).toHaveProperty('recentGames');
  });

  test('/api/opponents returns {opponents:[...]} shape', async ({ request }) => {
    const res = await request.get('/api/opponents');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('opponents');
    expect(Array.isArray(body.opponents)).toBeTruthy();
    expect(body.opponents.length).toBeGreaterThan(0);
  });

  test('/api/stats returns expected shape', async ({ request }) => {
    const res = await request.get('/api/stats');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('elo');
    expect(body).toHaveProperty('eloHistory');
    expect(body).toHaveProperty('wins');
    expect(body).toHaveProperty('losses');
  });

  test('/api/games returns expected shape', async ({ request }) => {
    const res = await request.get('/api/games');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('games');
    expect(Array.isArray(body.games)).toBeTruthy();
  });

  test('/api/puzzles/due returns expected shape', async ({ request }) => {
    const res = await request.get('/api/puzzles/due');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('cards');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.cards)).toBeTruthy();
  });
});
