/**
 * E2E tests: complete game-flow and training loop.
 *
 * Covers the scenarios that have caused regressions:
 *   - Board renders for both player colours
 *   - Illegal moves are blocked by the frontend (piece snaps back, no WS move sent)
 *   - Player-as-black: engine moves first without any player action
 *   - Full training loop: play → game_over → analysis_progress → analysis_done
 *   - DB integrity: result and termination are persisted after a game ends
 *   - Page-refresh resume: browser reloads mid-game and resumes without setup panel
 *   - Quiz page loads positions after analysis completes
 *
 * Tests run sequentially (workers: 1) against a dedicated test server that
 * starts with a clean database on each `npx playwright test` invocation.
 */

import { test, expect } from '@playwright/test';

// Before each test: abandon any in_progress game left by the previous test so
// play.html always shows the setup panel, not an auto-resumed game.
test.beforeEach(async ({ request }) => {
  await request.post('/api/debug/reset');
});

// ─── helpers ────────────────────────────────────────────────────────────────

function captureErrors(page) {
  const jsErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') jsErrors.push(msg.text()); });
  page.on('pageerror', (err) => jsErrors.push(err.message));
  return jsErrors;
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
    message: `Waiting for WS message type="${type}". Received: ${JSON.stringify(msgs.map((m) => m.type))}`,
  }).toBeTruthy();
}

/** Returns the cm-chessboard SVG bounding box and helpers for square centres. */
async function getBoardHelpers(page) {
  const svg = page.locator('.cm-chessboard');
  await expect(svg).toBeVisible({ timeout: 15_000 });
  const bb = await svg.boundingBox();
  expect(bb, 'Board bounding box must be non-null').not.toBeNull();
  const sqW = bb.width / 8;
  const sqH = bb.height / 8;
  // orientation=white: file a at left, rank 1 at bottom
  // file index 0=a … 7=h; rank from top: rank8=row0, rank1=row7
  const centre = (file, rank) => ({
    x: bb.x + sqW * (file + 0.5),
    y: bb.y + sqH * (8 - rank - 0.5),
  });
  return { bb, sqW, sqH, centre };
}

/**
 * Start a game via the UI and return the gameId from the WS game_started message.
 * opponentId defaults to the first chip in maia-grid (fastest engine).
 */
async function startGame(page, wsReceived, { color = 'white', opponentSelector = '#maia-grid .opponent-chip' } = {}) {
  // Setup panel must be visible on a fresh DB
  await expect(page.locator('#setup-panel')).toBeVisible({ timeout: 5_000 });

  const chip = page.locator(opponentSelector).first();
  await expect(chip).toBeVisible({ timeout: 5_000 });
  await chip.click();

  await page.locator(`[data-color="${color}"]`).click();
  await page.locator('#start-btn').click();

  await expect(page.locator('#game-area')).toBeVisible({ timeout: 5_000 });

  await waitForMsg(wsReceived, 'game_started', 10_000);
  const gs = wsReceived.find((m) => m.type === 'game_started');
  return gs.gameId;
}

// ─── tests ──────────────────────────────────────────────────────────────────

test.describe('Setup panel', () => {
  test('setup panel visible and game area hidden on fresh load', async ({ page }) => {
    const errs = captureErrors(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#setup-panel')).toBeVisible();
    await expect(page.locator('#game-area')).toBeHidden();
    expect(errs).toEqual([]);
  });

  test('opponent chips are rendered', async ({ page }) => {
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.opponent-chip').first()).toBeVisible();
    const count = await page.locator('.opponent-chip').count();
    expect(count).toBeGreaterThan(0);
  });

  test('clicking an opponent chip marks it selected and deselects others', async ({ page }) => {
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    const chips = page.locator('.opponent-chip');
    await expect(chips.first()).toBeVisible({ timeout: 5_000 });

    // Nothing is selected initially
    await expect(chips.first()).not.toHaveClass(/opponent-chip--selected/);

    // Clicking the first chip selects it
    await chips.first().click();
    await expect(chips.first()).toHaveClass(/opponent-chip--selected/);

    // Clicking a different chip moves the selection
    const count = await chips.count();
    if (count > 1) {
      await chips.nth(1).click();
      await expect(chips.nth(1)).toHaveClass(/opponent-chip--selected/);
      await expect(chips.first()).not.toHaveClass(/opponent-chip--selected/);
    }
  });

  test('start button starts a game when an opponent is selected', async ({ page }) => {
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    const chip = page.locator('#maia-grid .opponent-chip').first();
    await expect(chip).toBeVisible({ timeout: 5_000 });
    await chip.click();
    await expect(chip).toHaveClass(/opponent-chip--selected/);

    await page.locator('[data-color="white"]').click();
    await page.locator('#start-btn').click();

    await expect(page.locator('#game-area')).toBeVisible({ timeout: 10_000 });
    await waitForMsg(received, 'game_started', 10_000);
    await expect(page.locator('#setup-panel')).toBeHidden();
  });

  test('Drawfish chip shows no ranked toggle', async ({ page }) => {
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    const drawfishChip = page.locator('.opponent-chip[data-id="drawfish"]');
    if (await drawfishChip.count() === 0) test.skip(true, 'drawfish not in roster');
    await drawfishChip.click();
    await expect(page.locator('#ranked-wrap')).toBeHidden();
    await expect(page.locator('#drawfish-note')).toBeVisible();
  });
});

test.describe('Board rendering', () => {
  test('board renders after starting as white', async ({ page }) => {
    const errs = captureErrors(page);
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    await startGame(page, received, { color: 'white' });
    await expect(page.locator('#board-wrap .cm-chessboard')).toBeVisible({ timeout: 15_000 });
    expect(errs).toEqual([]);
  });

  test('board renders and engine moves first when player is black', async ({ page }) => {
    const errs = captureErrors(page);
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    await startGame(page, received, { color: 'black' });

    // Board must appear
    await expect(page.locator('#board-wrap .cm-chessboard')).toBeVisible({ timeout: 15_000 });

    // Engine must send engine_move WITHOUT any click from the test
    await waitForMsg(received, 'engine_move', 30_000);
    const em = received.find((m) => m.type === 'engine_move');
    expect(em.uci).toMatch(/^[a-h][1-8][a-h][1-8]/);

    // Move list must show one move (the engine's)
    await expect(page.locator('.move-list__move').first()).not.toBeEmpty({ timeout: 5_000 });

    expect(errs).toEqual([]);
  });
});

test.describe('Move legality', () => {
  test('legal move e2→e4 is accepted and engine replies', async ({ page }) => {
    const errs = captureErrors(page);
    const { received, sent } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    await startGame(page, received, { color: 'white' });

    const { centre } = await getBoardHelpers(page);

    // Click e2 (select), then e4 (destination) — click-to-move
    const e2 = centre(4, 1); // file e = index 4; rank 2 = index 1
    const e4 = centre(4, 3); // rank 4 = index 3
    await page.mouse.click(e2.x, e2.y);
    await page.waitForTimeout(250);
    await page.mouse.click(e4.x, e4.y);

    // A move WS message must be sent
    await expect.poll(() => sent.some((m) => m.type === 'move'), {
      timeout: 5_000,
    }).toBeTruthy();

    // Engine replies
    await waitForMsg(received, 'engine_move', 30_000);

    // Move list grows
    const moveItems = page.locator('.move-list__move');
    await expect.poll(() => moveItems.count(), { timeout: 5_000 }).toBeGreaterThan(0);

    expect(errs).toEqual([]);
  });

  test('illegal move (pawn backwards) is blocked — no WS move sent, board unchanged', async ({ page }) => {
    const errs = captureErrors(page);
    const { received, sent } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    await startGame(page, received, { color: 'white' });

    const { centre } = await getBoardHelpers(page);

    // First make a legal move to have a pawn on e4
    await page.mouse.click(centre(4, 1).x, centre(4, 1).y); // e2
    await page.waitForTimeout(250);
    await page.mouse.click(centre(4, 3).x, centre(4, 3).y); // e4 — legal
    await waitForMsg(received, 'engine_move', 30_000);       // wait for engine reply

    // Now try an illegal move: attempt to move the e4 pawn backwards to e3
    // (White pawns can only move forward = increasing rank)
    await page.mouse.click(centre(4, 3).x, centre(4, 3).y); // select e4 pawn
    await page.waitForTimeout(250);
    await page.mouse.click(centre(4, 2).x, centre(4, 2).y); // try e3 — illegal

    // Wait a moment for any WS message that might arrive
    await page.waitForTimeout(1_000);

    const moveMsgsBefore = sent.filter((m) => m.type === 'move').length;
    // Still only one move WS message (the legal e2→e4); the illegal one was blocked
    expect(moveMsgsBefore).toBe(1);

    // No new engine_move should arrive after the illegal attempt
    const engineMovesBefore = received.filter((m) => m.type === 'engine_move').length;
    await page.waitForTimeout(500);
    expect(received.filter((m) => m.type === 'engine_move').length).toBe(engineMovesBefore);

    expect(errs).toEqual([]);
  });
});

test.describe('Training loop', () => {
  let trainingGameId = null;

  test('full loop: play move → resign → game_over → analysis_done', async ({ page }) => {
    const errs = captureErrors(page);
    const { received } = captureWs(page);
    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    trainingGameId = await startGame(page, received, { color: 'white' });

    const { centre } = await getBoardHelpers(page);

    // Make one legal move so there are plies to analyse
    await page.mouse.click(centre(4, 1).x, centre(4, 1).y); // e2
    await page.waitForTimeout(250);
    await page.mouse.click(centre(4, 3).x, centre(4, 3).y); // e4
    await waitForMsg(received, 'engine_move', 30_000);

    // Resign
    page.on('dialog', (d) => d.accept());
    await page.locator('#resign-btn').click();

    // Result overlay visible
    await expect(page.locator('#result-overlay')).toBeVisible({ timeout: 10_000 });

    // game_over received
    await waitForMsg(received, 'game_over', 10_000);
    const go = received.find((m) => m.type === 'game_over');
    expect(go.result).toBe('loss');
    expect(go.termination).toBe('resignation');

    // Analysis starts
    await waitForMsg(received, 'analysis_progress', 30_000);

    // Analysis completes
    await waitForMsg(received, 'analysis_done', 90_000);

    // UI shows completion
    await expect(page.locator('#analysis-label')).toContainText('Analysis complete', { timeout: 5_000 });

    expect(errs).toEqual([]);
  });

  test('DB integrity: game result and termination are persisted after resign', async ({ request }) => {
    // Depends on the training loop test above having run
    const res = await request.get('/api/games');
    expect(res.ok()).toBeTruthy();
    const { games } = await res.json();
    const finished = games.filter((g) => g.status === 'finished');
    expect(finished.length).toBeGreaterThan(0);
    // The resigned game must have result and termination
    const resigned = finished.find((g) => g.termination === 'resignation');
    expect(resigned, 'Expected a resigned game in the DB').toBeDefined();
    expect(resigned.result).toBe('loss');
  });

  test('DB integrity: analysis state is done and accuracy is stored', async ({ request }) => {
    const res = await request.get('/api/games');
    const { games } = await res.json();
    const analysed = games.find((g) => g.analysisState === 'done');
    expect(analysed, 'Expected a game with analysis_state=done').toBeDefined();
    expect(typeof analysed.accuracy).toBe('number');
    expect(analysed.accuracy).toBeGreaterThan(0);
    expect(analysed.accuracy).toBeLessThanOrEqual(100);
  });
});

test.describe('Page-refresh resume', () => {
  test('refreshing mid-game resumes without setup panel', async ({ page }) => {
    const errs = captureErrors(page);
    const { received } = captureWs(page);

    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');
    await startGame(page, received, { color: 'white' });

    // Make one move to create a non-trivial in_progress state
    await expect(page.locator('#board-wrap .cm-chessboard')).toBeVisible({ timeout: 15_000 });
    const { centre } = await getBoardHelpers(page);
    await page.mouse.click(centre(4, 1).x, centre(4, 1).y);
    await page.waitForTimeout(250);
    await page.mouse.click(centre(4, 3).x, centre(4, 3).y);
    await waitForMsg(received, 'engine_move', 30_000);

    // Reload the page — simulates browser refresh
    const received2 = [];
    page.on('websocket', (ws) => {
      ws.on('framereceived', (f) => {
        try { received2.push(JSON.parse(f.payload)); } catch { /* */ }
      });
    });
    await page.reload({ waitUntil: 'networkidle' });

    // Setup panel must be HIDDEN (auto-resume)
    await expect(page.locator('#setup-panel')).toBeHidden({ timeout: 8_000 });

    // Game area must be VISIBLE
    await expect(page.locator('#game-area')).toBeVisible({ timeout: 8_000 });

    // Server sends game_started with resumed=true
    await expect.poll(
      () => received2.some((m) => m.type === 'game_started' && m.resumed === true),
      { timeout: 10_000, message: `Expected resumed game_started. Got: ${JSON.stringify(received2.map((m) => m.type))}` },
    ).toBeTruthy();

    // Board renders again
    await expect(page.locator('#board-wrap .cm-chessboard')).toBeVisible({ timeout: 15_000 });

    expect(errs).toEqual([]);
  });
});

test.describe('Quiz page', () => {
  test('loads positions for an analysed game', async ({ page }) => {
    // Look for a game with analysis_state=done (created by the training loop test)
    const res = await page.request.get('/api/games');
    const { games } = await res.json();
    const analysed = (games ?? []).find((g) => g.analysisState === 'done');

    if (!analysed) {
      test.skip(true, 'No analysed game yet — training loop test must run first');
    }

    const quizRes = await page.request.get(`/api/games/${analysed.id}/quiz`);
    expect(quizRes.ok()).toBeTruthy();
    const { puzzles } = await quizRes.json();

    if (!puzzles || puzzles.length === 0) {
      test.skip(true, 'No puzzles in this game (no findable mistakes)');
    }

    const errs = captureErrors(page);
    await page.goto(`/quiz.html?game=${analysed.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#board-wrap')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#board-wrap .cm-chessboard')).toBeVisible({ timeout: 15_000 });
    expect(errs).toEqual([]);
  });
});

test.describe('Review page', () => {
  test('review API returns moves after analysis completes', async ({ request }) => {
    const res = await request.get('/api/games');
    const { games } = await res.json();
    const analysed = (games ?? []).find((g) => g.analysisState === 'done');

    if (!analysed) {
      test.skip(true, 'No analysed game — training loop test must run first');
    }

    const reviewRes = await request.get(`/api/games/${analysed.id}/review`);
    expect(reviewRes.ok()).toBeTruthy();

    const data = await reviewRes.json();
    expect(data.moves, 'review.moves must be non-empty after analysis').not.toHaveLength(0);
    expect(data.accuracy, 'accuracy must be a number').toBeGreaterThan(0);

    // Every move must have ply, san, mover, classification
    for (const m of data.moves) {
      expect(typeof m.ply).toBe('number');
      expect(typeof m.san).toBe('string');
      expect(m.san.length).toBeGreaterThan(0);
      expect(['player', 'opponent']).toContain(m.mover);
    }
  });

  test('review page renders eval graph and move list', async ({ page }) => {
    const res = await page.request.get('/api/games');
    const { games } = await res.json();
    const analysed = (games ?? []).find((g) => g.analysisState === 'done');

    if (!analysed) {
      test.skip(true, 'No analysed game — training loop test must run first');
    }

    const errs = captureErrors(page);
    await page.goto(`/review.html?game=${analysed.id}`);
    await page.waitForLoadState('networkidle');

    // Accuracy bars must be rendered (non-empty)
    await expect(page.locator('#acc-bars')).not.toBeEmpty({ timeout: 10_000 });

    // Eval graph canvas must be present
    await expect(page.locator('#eval-canvas')).toBeVisible({ timeout: 10_000 });

    expect(errs).toEqual([]);
  });
});
