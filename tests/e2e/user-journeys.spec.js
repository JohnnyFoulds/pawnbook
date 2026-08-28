/**
 * E2E user-journey tests.
 *
 * Each describe block is a complete user flow end-to-end, exercising
 * actual clicks and navigation the way a real user would. Tests in this
 * file depend on game-flow.spec.js having run first (same Playwright
 * worker) so that at least one analysed game exists in the DB.
 *
 * Coverage:
 *   - Play again flow: result overlay → "Play again" → setup panel reopens
 *   - Post-game navigation: "Review & quiz" link destinations
 *   - Games list → review.html navigation
 *   - Review page interactions: move list scrubbing, table view toggle
 *   - Drill page: board renders, move submission shows feedback
 *   - Dashboard navigation cards
 *   - Time control chip selection
 *   - Color selection (black)
 *   - Ranked toggle
 */

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/debug/reset');
});

// ─── helpers ────────────────────────────────────────────────────────────────

function captureErrors(page) {
  const errs = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errs.push(msg.text()); });
  page.on('pageerror', (err) => errs.push(err.message));
  return errs;
}

function captureWs(page) {
  const received = [];
  const sent = [];
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => { try { received.push(JSON.parse(f.payload)); } catch { /* */ } });
    ws.on('framesent',    (f) => { try { sent.push(JSON.parse(f.payload)); } catch { /* */ } });
  });
  return { received, sent };
}

async function waitForMsg(msgs, type, timeout = 30_000) {
  return expect.poll(() => msgs.some((m) => m.type === type), {
    timeout,
    message: `Waiting for WS message type="${type}". Got: ${JSON.stringify(msgs.map((m) => m.type))}`,
  }).toBeTruthy();
}

async function getBoardHelpers(page) {
  const svg = page.locator('.cm-chessboard');
  await expect(svg).toBeVisible({ timeout: 15_000 });
  const bb = await svg.boundingBox();
  const sqW = bb.width / 8;
  const sqH = bb.height / 8;
  const centre = (file, rank) => ({
    x: bb.x + sqW * (file + 0.5),
    y: bb.y + sqH * (8 - rank - 0.5),
  });
  return { bb, sqW, sqH, centre };
}

/** Start a game and resign, returning gameId. Waits for game_over. */
async function playAndResign(page, wsReceived) {
  await expect(page.locator('#setup-panel')).toBeVisible({ timeout: 5_000 });

  const chip = page.locator('#maia-grid .opponent-chip').first();
  await expect(chip).toBeVisible({ timeout: 5_000 });
  await chip.click();
  await expect(chip).toHaveClass(/opponent-chip--selected/);

  await page.locator('[data-color="white"]').click();
  await page.locator('#start-btn').click();

  await expect(page.locator('#game-area')).toBeVisible({ timeout: 8_000 });
  await waitForMsg(wsReceived, 'game_started', 10_000);
  const gs = wsReceived.find((m) => m.type === 'game_started');
  const gameId = gs.gameId;

  // Make one move
  const { centre } = await getBoardHelpers(page);
  await page.mouse.click(centre(4, 1).x, centre(4, 1).y);
  await page.waitForTimeout(200);
  await page.mouse.click(centre(4, 3).x, centre(4, 3).y);
  await waitForMsg(wsReceived, 'engine_move', 30_000);

  // Resign
  page.on('dialog', (d) => d.accept());
  await page.locator('#resign-btn').click();
  await expect(page.locator('#result-overlay')).toBeVisible({ timeout: 8_000 });
  await waitForMsg(wsReceived, 'game_over', 8_000);

  return gameId;
}

// ─── Play again flow ─────────────────────────────────────────────────────────

test.describe('Play again flow', () => {
  test('result overlay shows, then "Play again" reopens setup panel', async ({ page }) => {
    const errs = captureErrors(page);
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    await playAndResign(page, received);

    // Result overlay is up
    await expect(page.locator('#result-overlay')).toBeVisible();
    await expect(page.locator('#result-outcome')).not.toBeEmpty();

    // Click "Play again"
    await page.locator('#play-again-btn').click();

    // Setup panel must reappear; game area must be hidden
    await expect(page.locator('#setup-panel')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#game-area')).toBeHidden();
    await expect(page.locator('#result-overlay')).toBeHidden();

    // Opponent chips are still present and clickable
    const chip = page.locator('#maia-grid .opponent-chip').first();
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(chip).toHaveClass(/opponent-chip--selected/);

    // Can start another game
    await page.locator('[data-color="white"]').click();
    await page.locator('#start-btn').click();
    await expect(page.locator('#game-area')).toBeVisible({ timeout: 8_000 });

    expect(errs).toEqual([]);
  });

  test('result overlay shows outcome text matching game result', async ({ page }) => {
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    await playAndResign(page, received);

    await expect(page.locator('#result-outcome')).toContainText(/lost|won|draw/i, { timeout: 5_000 });
    await expect(page.locator('#result-termination')).toContainText(/resignation/i);
  });
});

// ─── Post-game navigation ─────────────────────────────────────────────────────

test.describe('Post-game navigation', () => {
  test('review-link points to review.html for the correct game', async ({ page }) => {
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    const gameId = await playAndResign(page, received);

    // review-link href is set in onAnalysisDone, so wait for that event first
    await waitForMsg(received, 'analysis_done', 15_000);
    const href = await page.locator('#review-link').getAttribute('href');
    expect(href).toMatch(new RegExp(`game=${gameId}`));
    expect(href).toMatch(/review\.html|quiz\.html/);
  });

  test('after analysis_done the review-link navigates to quiz or review page with board', async ({ page }) => {
    const errs = captureErrors(page);
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    await playAndResign(page, received);

    // Wait for analysis to finish
    await waitForMsg(received, 'analysis_done', 90_000);
    await expect(page.locator('#analysis-label')).toContainText('Analysis complete', { timeout: 5_000 });

    // Click the review/quiz link
    await page.locator('#review-link').click();
    await page.waitForLoadState('networkidle');

    // Should land on quiz.html or review.html
    expect(page.url()).toMatch(/quiz\.html|review\.html/);

    // Board-wrap must be present on either destination
    await expect(page.locator('#board-wrap')).toBeVisible({ timeout: 15_000 });

    expect(errs).toEqual([]);
  });
});

// ─── Games list → review navigation ──────────────────────────────────────────

test.describe('Games list navigation', () => {
  test('games.html shows finished games with opponent links', async ({ page }) => {
    const errs = captureErrors(page);
    // Make sure there is at least one finished game
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    await playAndResign(page, received);
    await waitForMsg(received, 'game_over', 10_000);

    await page.goto('/games.html');
    await page.waitForLoadState('networkidle');

    // Table body must have at least one row
    const rows = page.locator('#games-body tr');
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThan(0);

    // Each row has an opponent name link
    const firstLink = page.locator('#games-body tr').first().locator('a');
    await expect(firstLink).toBeVisible();
    const href = await firstLink.getAttribute('href');
    expect(href).toMatch(/review\.html\?game=/);

    expect(errs).toEqual([]);
  });

  test('clicking a game link navigates to review.html with eval graph', async ({ page }) => {
    const errs = captureErrors(page);
    // Ensure an analysed game exists
    const res = await page.request.get('/api/games');
    const { games } = await res.json();
    const analysed = games.find((g) => g.analysisState === 'done');
    if (!analysed) test.skip(true, 'No analysed game — run training loop first');

    await page.goto('/games.html');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('#games-body tr');
    await expect.poll(() => rows.count(), { timeout: 8_000 }).toBeGreaterThan(0);

    // Find the row for the analysed game and click it
    const link = page.locator(`#games-body a[href*="${analysed.id}"]`);
    await expect(link).toBeVisible({ timeout: 5_000 });
    await link.click();
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('review.html');
    expect(page.url()).toContain(analysed.id);

    await expect(page.locator('#eval-canvas')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#acc-bars')).not.toBeEmpty({ timeout: 10_000 });

    expect(errs).toEqual([]);
  });
});

// ─── Review page interactions ─────────────────────────────────────────────────

test.describe('Review page interactions', () => {
  test('move list entries are present and clicking one updates the ply label', async ({ page }) => {
    const errs = captureErrors(page);
    const res = await page.request.get('/api/games');
    const { games } = await res.json();
    const analysed = games.find((g) => g.analysisState === 'done');
    if (!analysed) test.skip(true, 'No analysed game');

    await page.goto(`/review.html?game=${analysed.id}`);
    await page.waitForLoadState('networkidle');

    // Move list must have entries
    const moves = page.locator('#move-list .move-list__move');
    await expect.poll(() => moves.count(), { timeout: 10_000 }).toBeGreaterThan(0);

    // Click the first move → ply label should update
    const labelBefore = await page.locator('#ply-label').textContent();
    await moves.first().click();
    await expect.poll(
      async () => (await page.locator('#ply-label').textContent()) !== labelBefore,
      { timeout: 5_000, message: 'ply-label did not update after move click' },
    ).toBeTruthy();

    expect(errs).toEqual([]);
  });

  test('eval table view toggle shows a table with rows', async ({ page }) => {
    const errs = captureErrors(page);
    const res = await page.request.get('/api/games');
    const { games } = await res.json();
    const analysed = games.find((g) => g.analysisState === 'done');
    if (!analysed) test.skip(true, 'No analysed game');

    await page.goto(`/review.html?game=${analysed.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#eval-canvas')).toBeVisible({ timeout: 10_000 });

    // Initially table is hidden
    await expect(page.locator('#eval-table-wrap')).toBeHidden();

    // Click "table view" toggle
    await page.locator('#eval-table-toggle').click();

    // Table wrap becomes visible and has rows
    await expect(page.locator('#eval-table-wrap')).toBeVisible({ timeout: 3_000 });
    const tableRows = page.locator('#eval-table-body tr');
    await expect.poll(() => tableRows.count(), { timeout: 5_000 }).toBeGreaterThan(0);

    // Toggle back hides it again
    await page.locator('#eval-table-toggle').click();
    await expect(page.locator('#eval-table-wrap')).toBeHidden();

    expect(errs).toEqual([]);
  });

  test('start quiz link on review page navigates to quiz', async ({ page }) => {
    const res = await page.request.get('/api/games');
    const { games } = await res.json();
    const analysed = games.find((g) => g.analysisState === 'done');
    if (!analysed) test.skip(true, 'No analysed game');

    await page.goto(`/review.html?game=${analysed.id}`);
    await page.waitForLoadState('networkidle');

    const quizLink = page.locator('#quiz-link');
    await expect(quizLink).toBeVisible({ timeout: 10_000 });
    const href = await quizLink.getAttribute('href');
    expect(href).toContain('quiz.html');
    expect(href).toContain(analysed.id);
  });
});

// ─── Drill / puzzles page ─────────────────────────────────────────────────────

test.describe('Drill page', () => {
  test('shows empty state with Play link when no cards are due', async ({ page }) => {
    const errs = captureErrors(page);
    // Check if there actually are no cards due
    const res = await page.request.get('/api/puzzles/due');
    const { cards } = await res.json();
    if (cards && cards.length > 0) test.skip(true, 'Cards are due — run the non-empty test instead');

    await page.goto('/puzzles.html');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#empty-state')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#drill-ui')).toBeHidden();
    await expect(page.locator('#empty-state a[href="play.html"]')).toBeVisible();

    expect(errs).toEqual([]);
  });

  test('board renders and move submission gives feedback when puzzles are due', async ({ page }) => {
    const errs = captureErrors(page);
    const res = await page.request.get('/api/puzzles/due');
    const { cards } = await res.json();
    if (!cards || cards.length === 0) test.skip(true, 'No puzzles due — need an analysed game first');

    await page.goto('/puzzles.html');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#drill-ui')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#board-wrap .cm-chessboard')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#drill-prompt')).not.toBeEmpty({ timeout: 5_000 });

    // Submit a move — click any square twice to attempt something on the board
    const { centre } = await getBoardHelpers(page);
    // Try to move the piece by clicking a source and destination
    // We don't know the exact position so we just click around; the feedback-wrap will update
    const e2 = centre(4, 1);
    const e4 = centre(4, 3);
    await page.mouse.click(e2.x, e2.y);
    await page.waitForTimeout(300);
    await page.mouse.click(e4.x, e4.y);

    // Either correct or wrong feedback must appear
    await expect.poll(
      () => page.locator('#feedback-wrap').textContent(),
      { timeout: 10_000, message: 'Expected feedback after move attempt' },
    ).toMatch(/[✓✗]/);

    // The next-wrap becomes visible (if correct) or retry available
    // Either next-wrap is shown or the wrong feedback message is visible
    const hasFeedback = await page.locator('#feedback-wrap').textContent();
    expect(hasFeedback.trim().length).toBeGreaterThan(0);

    expect(errs).toEqual([]);
  });

  test('batch progress pip row is rendered', async ({ page }) => {
    const res = await page.request.get('/api/puzzles/due');
    const { cards } = await res.json();
    if (!cards || cards.length === 0) test.skip(true, 'No puzzles due');

    await page.goto('/puzzles.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#drill-ui')).toBeVisible({ timeout: 5_000 });

    const pips = page.locator('#drill-pips .drill-pip');
    await expect.poll(() => pips.count(), { timeout: 5_000 }).toBeGreaterThan(0);
  });
});

// ─── Dashboard navigation ─────────────────────────────────────────────────────

test.describe('Dashboard navigation', () => {
  test('Play card navigates to play.html with setup panel visible', async ({ page }) => {
    const errs = captureErrors(page);
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');

    // Click the Play nav link
    await page.locator('a[href="play.html"]').first().click();
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('play.html');
    await expect(page.locator('#setup-panel')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.opponent-chip').first()).toBeVisible();

    expect(errs).toEqual([]);
  });

  test('Drill card navigates to puzzles.html', async ({ page }) => {
    const errs = captureErrors(page);
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');

    await page.locator('a[href="puzzles.html"]').first().click();
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('puzzles.html');
    // Either empty-state or drill-ui should be visible
    const hasEmpty = await page.locator('#empty-state').isVisible();
    const hasDrill = await page.locator('#drill-ui').isVisible();
    expect(hasEmpty || hasDrill).toBeTruthy();

    expect(errs).toEqual([]);
  });

  test('Games nav link navigates to games.html', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');
    await page.locator('a[href="games.html"]').first().click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('games.html');
  });

  test('Stats nav link navigates to stats.html', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');
    await page.locator('a[href="stats.html"]').first().click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('stats.html');
  });
});

// ─── Setup panel options ──────────────────────────────────────────────────────

test.describe('Setup panel options', () => {
  test('time control chips are selectable and update selection state', async ({ page }) => {
    const errs = captureErrors(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    const chips = page.locator('.time-chip');
    await expect(chips.first()).toBeVisible({ timeout: 5_000 });

    // Untimed should be selected by default
    const untimed = page.locator('.time-chip[data-tc="null"]');
    await expect(untimed).toHaveClass(/time-chip--selected/);

    // Click a timed control
    const tenZero = page.locator('.time-chip[data-tc="600,0"]');
    await tenZero.click();
    await expect(tenZero).toHaveClass(/time-chip--selected/);
    await expect(untimed).not.toHaveClass(/time-chip--selected/);

    // Click untimed again
    await untimed.click();
    await expect(untimed).toHaveClass(/time-chip--selected/);
    await expect(tenZero).not.toHaveClass(/time-chip--selected/);

    expect(errs).toEqual([]);
  });

  test('color chips are selectable — black selection works', async ({ page }) => {
    const errs = captureErrors(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    // Random is selected by default
    const randomChip = page.locator('[data-color="random"]');
    await expect(randomChip).toHaveClass(/color-chip--selected/);

    const blackChip = page.locator('[data-color="black"]');
    await blackChip.click();
    await expect(blackChip).toHaveClass(/color-chip--selected/);
    await expect(randomChip).not.toHaveClass(/color-chip--selected/);

    expect(errs).toEqual([]);
  });

  test('ranked toggle can be unchecked for casual games', async ({ page }) => {
    const errs = captureErrors(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    // First select an opponent so ranked-wrap is visible (it may start hidden)
    const chip = page.locator('#maia-grid .opponent-chip').first();
    await chip.click();

    const toggle = page.locator('#ranked-toggle');
    await expect(toggle).toBeChecked({ timeout: 5_000 }); // default: ranked on

    // The input is visually hidden; click its label instead
    await page.locator('label.toggle').click();
    await expect(toggle).not.toBeChecked();

    // Can toggle back
    await page.locator('label.toggle').click();
    await expect(toggle).toBeChecked();

    expect(errs).toEqual([]);
  });

  test('starting as black causes engine to move first', async ({ page }) => {
    const errs = captureErrors(page);
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    const chip = page.locator('#maia-grid .opponent-chip').first();
    await chip.click();
    await page.locator('[data-color="black"]').click();
    await page.locator('#start-btn').click();

    await expect(page.locator('#game-area')).toBeVisible({ timeout: 8_000 });
    await waitForMsg(received, 'engine_move', 30_000);

    // Engine move must arrive with no player interaction
    const em = received.find((m) => m.type === 'engine_move');
    expect(em.uci).toMatch(/^[a-h][1-8][a-h][1-8]/);

    expect(errs).toEqual([]);
  });
});

// ─── Analysis progress UI ─────────────────────────────────────────────────────

test.describe('Analysis progress UI', () => {
  test('progress bar fills to 100% during analysis', async ({ page }) => {
    const errs = captureErrors(page);
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    await playAndResign(page, received);
    await expect(page.locator('#result-overlay')).toBeVisible({ timeout: 5_000 });

    // Progress bar should reach 100% by analysis_done
    await waitForMsg(received, 'analysis_done', 90_000);
    const width = await page.locator('#analysis-progress').getAttribute('style');
    expect(width).toContain('100%');
    await expect(page.locator('#analysis-label')).toContainText('Analysis complete');

    expect(errs).toEqual([]);
  });

  test('analysis_done updates review-link text to include puzzle count when > 0', async ({ page }) => {
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    await playAndResign(page, received);
    await waitForMsg(received, 'analysis_done', 90_000);

    const done = received.find((m) => m.type === 'analysis_done');
    if (done.puzzleCount > 0) {
      await expect(page.locator('#review-link')).toContainText(/\(\d+ positions?\)/);
      const href = await page.locator('#review-link').getAttribute('href');
      expect(href).toContain('quiz.html');
    } else {
      // No puzzles — link stays as review.html
      const href = await page.locator('#review-link').getAttribute('href');
      expect(href).toContain('review.html');
    }
  });
});
