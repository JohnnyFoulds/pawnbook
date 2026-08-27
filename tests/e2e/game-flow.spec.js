/**
 * Deep E2E test: complete game flow from setup through board render and move exchange.
 * Validates that cm-chessboard loads, the board renders with pieces, and the
 * WebSocket round-trip (player move → engine reply) works end-to-end.
 */

import { test, expect } from '@playwright/test';

test.describe('Game flow (play.html)', () => {
  test('board renders after starting a game', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    // Opponent grid must be populated
    const chips = page.locator('.opponent-chip');
    await expect(chips.first()).toBeVisible({ timeout: 5000 });

    // Select Maia 1100 (first chip in maia-grid), or whichever is first
    const maiaChip = page.locator('#maia-grid .opponent-chip').first();
    await maiaChip.click();

    // Start game
    await page.locator('#start-btn').click();

    // Game area becomes visible
    await expect(page.locator('#game-area')).toBeVisible({ timeout: 5000 });

    // Board container appears inside board-wrap (cm-chessboard renders a canvas or SVG)
    const boardWrap = page.locator('#board-wrap');
    await expect(boardWrap).toBeVisible({ timeout: 10000 });

    // Wait for cm-chessboard to inject its DOM (svg or canvas child)
    await expect(boardWrap.locator('svg, canvas, .cm-chessboard')).toBeVisible({ timeout: 15000 });

    // No JS errors during the whole flow
    expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('player can make a move and engine replies', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    // Track WebSocket messages for game_started and engine_move
    const wsMessages = [];
    const wsSent = [];
    page.on('websocket', (ws) => {
      ws.on('framereceived', (data) => {
        try { wsMessages.push(JSON.parse(data.payload)); } catch { /* ignore */ }
      });
      ws.on('framesent', (data) => {
        try { wsSent.push(JSON.parse(data.payload)); } catch { /* ignore */ }
      });
    });

    await page.goto('/play.html');
    await page.waitForLoadState('networkidle');

    // Select first available opponent and force white so we move first
    const firstChip = page.locator('.opponent-chip').first();
    await firstChip.click();

    // Select white to guarantee we move first
    await page.locator('[data-color="white"]').click();

    await page.locator('#start-btn').click();
    await expect(page.locator('#game-area')).toBeVisible({ timeout: 5000 });

    // Wait for game_started WebSocket message
    await expect.poll(() => wsMessages.some((m) => m.type === 'game_started'), {
      timeout: 10000,
    }).toBeTruthy();

    // Wait for board to render
    await expect(page.locator('#board-wrap svg, #board-wrap canvas, #board-wrap .cm-chessboard')).toBeVisible({
      timeout: 15000,
    });

    // Make a move: click e2 then e4 using board pixel coordinates.
    // cm-chessboard renders an SVG with class "cm-chessboard"; squares are an
    // 8×8 grid with white orientation (rank 1 at bottom, file a at left).
    // e2 = col 4 (0-indexed), row 6 from top; e4 = col 4, row 4 from top.
    const boardSvg = page.locator('.cm-chessboard');
    const bbox = await boardSvg.boundingBox();

    expect(bbox, 'Board bounding box must be non-null').not.toBeNull();
    expect(bbox.width, 'Board must have width > 0').toBeGreaterThan(0);

    const sqW = bbox.width / 8;
    const sqH = bbox.height / 8;

    // Click e2 (piece selection), then e4 (destination) — click-to-move
    await page.mouse.click(bbox.x + sqW * 4.5, bbox.y + sqH * 6.5);
    await page.waitForTimeout(300);
    await page.mouse.click(bbox.x + sqW * 4.5, bbox.y + sqH * 4.5);

    // Wait for engine_move reply (engine thinks and replies over WS)
    await expect.poll(() => wsMessages.some((m) => m.type === 'engine_move' || m.type === 'game_over'), {
      timeout: 30000,
      message: `Waiting for engine_move or game_over.\nWS received: ${JSON.stringify(wsMessages.map((m) => m.type))}\nWS sent: ${JSON.stringify(wsSent.map((m) => m.type))}`,
    }).toBeTruthy();

    // Move list should now have at least one move
    const moveItems = page.locator('.move-list__move');
    const count = await moveItems.count();
    expect(count).toBeGreaterThan(0);

    expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });
});
