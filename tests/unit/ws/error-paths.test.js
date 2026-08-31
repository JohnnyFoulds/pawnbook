/**
 * Phase 17 — Error-path unit tests.
 * Covers: weights_missing before game row, hint_not_allowed, analysis engine failure.
 */

// ── fs mock: existsSync returns false by default, can be overridden per test ──
// Must be hoisted before vitest import so vi.mock runs at module evaluation time.
import { existsSync } from 'fs';

import { describe, it, expect, vi } from 'vitest';

import { makeMessageHandler } from '../../../src/api/ws/handlers.js';
import { analyseGame } from '../../../src/api/ws/analysis-service.js';
import { InMemoryGameRepository, InMemoryRepertoireRepository, InMemoryPuzzleRepository } from '../../../src/adapters/memory/repositories.js';
import { FixedClock } from '../../../src/adapters/clock/fixed-clock.js';
import { ManualTimer } from '../../../src/adapters/scheduler/manual-timer.js';
import { EngineUnavailableError } from '../../../src/errors.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: vi.fn().mockReturnValue(false) };
});

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWs() {
  const ws = {
    readyState: 1, OPEN: 1,
    _messages: [],
    _events: {},
    send(data) { this._messages.push(JSON.parse(data)); },
    emit(ev, ...args) { if (this._events[ev]) this._events[ev](...args); },
    on(ev, fn) { this._events[ev] = fn; },
    once(ev, fn) { this._events[ev] = fn; },
    lastOfType(t) { return [...this._messages].reverse().find(m => m.type === t); },
    messagesOfType(t) { return this._messages.filter(m => m.type === t); },
  };
  return ws;
}

function makeHandler(opts = {}) {
  const gameRepo = opts.gameRepo ?? new InMemoryGameRepository();
  const clock = new FixedClock(1_000_000);
  const scheduler = new ManualTimer();
  const repertoireRepo = opts.repertoireRepo ?? new InMemoryRepertoireRepository();
  const handler = makeMessageHandler({ gameRepo, clock, repertoireRepo, scheduler, enginePool: opts.enginePool ?? null });
  return { handler, gameRepo, clock, scheduler };
}

// ── weights_missing — maia3 binary missing ────────────────────────────────────

describe('WeightsMissingError: fired before game row is saved', () => {
  it('maia3 opponent: returns weights_missing error and saves no game row', async () => {
    existsSync.mockReturnValue(false);
    const { handler, gameRepo } = makeHandler();
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game', opponentId: 'maia-1100', color: 'white', ranked: false,
    }));

    const err = ws.lastOfType('error');
    expect(err).toBeDefined();
    expect(err.error_code).toBe('weights_missing');
    expect(gameRepo.listRecent(10)).toHaveLength(0);
  });

  it('maia1 (lc0) opponent: returns weights_missing error and saves no game row', async () => {
    existsSync.mockReturnValue(false);
    const { handler, gameRepo } = makeHandler();
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game', opponentId: 'maia1-1100', color: 'white', ranked: false,
    }));

    const err = ws.lastOfType('error');
    expect(err).toBeDefined();
    expect(err.error_code).toBe('weights_missing');
    expect(gameRepo.listRecent(10)).toHaveLength(0);
  });

  it('stockfish opponent: starts game normally even when existsSync returns false', async () => {
    existsSync.mockReturnValue(false);
    const { handler, gameRepo } = makeHandler();
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false,
    }));

    expect(ws.lastOfType('game_started')).toBeDefined();
    expect(gameRepo.listRecent(10)).toHaveLength(1);
  });
});

// ── hint_not_allowed ──────────────────────────────────────────────────────────

describe('hint_not_allowed: hint in a ranked game', () => {
  it('returns hint_not_allowed error when hint is sent during a ranked game', async () => {
    existsSync.mockReturnValue(true); // binary/weights present so game starts
    const { handler } = makeHandler();
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: true,
    }));
    expect(ws.lastOfType('game_started')).toBeDefined();

    await handler(ws, JSON.stringify({ type: 'hint' }));

    const err = ws.lastOfType('error');
    expect(err).toBeDefined();
    expect(err.error_code).toBe('hint_not_allowed');
  });
});

// ── analysis engine unavailable ───────────────────────────────────────────────

function makeSession(opts = {}) {
  return {
    opponent: { id: 'sf-1400', elo: 1400 },
    playerColor: 'white',
    ranked: false,
    alertsInGame: 0,
    ...opts,
  };
}

describe('analysis engine unavailable: analysis_state saved as failed', () => {
  it('saves analysis_state=failed and sends analysis_failed error when engine unavailable', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = { get: () => '1200' };
    const clock = new FixedClock(1_000_000);

    const gameId = 'test-game-1';
    gameRepo.save({
      id: gameId, opponentId: 'sf-1400', opponentElo: 1400,
      playerColor: 'white', ranked: false, status: 'finished', result: 'win',
    });
    gameRepo.appendMove(gameId, { uci: 'e2e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' });

    let callCount = 0;
    const enginePool = {
      getAnalysisSfClient: async () => {
        callCount++;
        throw new EngineUnavailableError('engine binary not executable');
      },
      getMaiaAnalysisClient: async () => { throw new EngineUnavailableError('maia unavailable'); },
    };

    const ws = makeWs();
    await analyseGame({ gameId, session: makeSession(), result: { result: 'win', termination: 'normal' }, ws, gameRepo, puzzleRepo, settingsRepo, enginePool, clock });

    const game = gameRepo.findById(gameId);
    expect(game.analysisState).toBe('failed');

    const errMsg = ws.lastOfType('error');
    expect(errMsg).toBeDefined();
    expect(errMsg.error_code).toBe('analysis_failed');

    // With retry logic: 3 attempts before giving up
    expect(callCount).toBe(3);
  });

  it('saves analysis_state=failed when runAnalysis throws mid-pass', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = { get: () => '1200' };
    const clock = new FixedClock(1_000_000);

    const gameId = 'test-game-2';
    gameRepo.save({
      id: gameId, opponentId: 'sf-1400', opponentElo: 1400,
      playerColor: 'white', ranked: false, status: 'finished', result: 'loss',
    });
    gameRepo.appendMove(gameId, { uci: 'e2e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' });

    const fakeClient = { analyse: async () => { throw new Error('engine killed mid-pass'); } };
    const enginePool = {
      getAnalysisSfClient: async () => fakeClient,
      getMaiaAnalysisClient: async () => fakeClient,
      reconfigureAnalysisSfForPassTwo: async () => {},
    };

    const ws = makeWs();
    await analyseGame({ gameId, session: makeSession(), result: { result: 'loss', termination: 'normal' }, ws, gameRepo, puzzleRepo, settingsRepo, enginePool, clock });

    const game = gameRepo.findById(gameId);
    expect(game.analysisState).toBe('failed');

    const errMsg = ws.lastOfType('error');
    expect(errMsg).toBeDefined();
    expect(errMsg.error_code).toBe('analysis_failed');
  });
});
