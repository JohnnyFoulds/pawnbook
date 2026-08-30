/**
 * @module tests/support/journey/harness
 * Core test harness for the longitudinal repertoire journey.
 *
 * Creates an in-process application over a real SQLite database (never
 * InMemoryRepository — see longitudinal_test_plan.md §Two-DB rule).
 * All non-determinism is injected:
 *   - clock  → FixedClock (advance with harness.advanceClock)
 *   - scheduler → ManualTimer (fire alert timeouts with harness.scheduler.fireAll)
 *   - enginePool → FakeEnginePool (deterministic first-legal-move)
 *
 * The repos are wrapped in a WriteProxy that counts every mutation and can
 * fail the run if writes happen outside expected sequences.
 *
 * IMPORTANT: This harness never opens data/chess.db. The DB path passed to
 * createJourneyHarness must be ':memory:' (vitest) or a tmp file (Playwright).
 */

import { EventEmitter } from 'events';

import { openDb } from '../../../src/adapters/sqlite/repositories.js';
import { FixedClock } from '../../../src/adapters/clock/fixed-clock.js';
import { ManualTimer } from '../../../src/adapters/scheduler/manual-timer.js';
import { createFakeEnginePool } from '../../../src/adapters/engine/fake-engine-pool.js';
import { createApp } from '../../../src/app.js';
import { analyseGame } from '../../../src/api/ws/analysis-service.js';

// ─── FakeWs ──────────────────────────────────────────────────────────────────

/**
 * Minimal WebSocket stand-in. Extends EventEmitter so ws.emit/ws.on work.
 * Captures every JSON message passed to ws.send() in _messages.
 */
class FakeWs extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1; // OPEN
    this.OPEN = 1;
    this._messages = [];
    this._pawnbookTracked = false;
  }

  send(data) {
    this._messages.push(JSON.parse(data));
  }

  /** Return all captured messages of a given type. */
  messagesOfType(type) {
    return this._messages.filter(m => m.type === type);
  }

  /** Return the last message of a given type, or undefined. */
  lastOfType(type) {
    const msgs = this.messagesOfType(type);
    return msgs[msgs.length - 1];
  }

  /** Clear the message buffer (call between games to keep per-game assertions clean). */
  clearMessages() {
    this._messages = [];
  }
}

// ─── WriteProxy ──────────────────────────────────────────────────────────────

const WRITE_METHODS = new Set([
  'save', 'appendMove', 'updateClock', 'saveMoveEval', 'savePreEval',
  'updateElo', 'appendObservation', 'upsertNode', 'upsertMove',
  'appendChangelog', 'incrementBookVersion', 'openChallenge',
  'closeChallenge', 'updateChallenge', 'transaction',
  'getOrCreateProvenance',
]);

/**
 * Wrap a repository with a write-counting proxy.
 * Provides:
 *   _writeCount — total mutations since last resetWriteCount()
 *   _writeLock  — if true, any write method throws (for verifying read-only phases)
 */
function createWriteProxy(repo) {
  const proxy = new Proxy(repo, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value !== 'function') return value;
      if (!WRITE_METHODS.has(prop)) return value.bind(target);
      return function (...args) {
        proxy._writeCount++;
        if (proxy._writeLock) {
          throw new Error(`WriteProxy: unexpected write to ${repo.constructor.name}.${prop}() — lock is set`);
        }
        return value.apply(target, args);
      };
    },
  });
  proxy._writeCount = 0;
  proxy._writeLock = false;
  proxy.resetWriteCount = () => { proxy._writeCount = 0; };
  return proxy;
}

// ─── JourneyHarness ──────────────────────────────────────────────────────────

/**
 * @typedef {object} JourneyHarness
 * @property {import('../../../src/adapters/clock/fixed-clock.js').FixedClock} clock
 * @property {import('../../../src/adapters/scheduler/manual-timer.js').ManualTimer} scheduler
 * @property {object} enginePool — FakeEnginePool
 * @property {object} gameRepo   — write-proxied SqliteGameRepository
 * @property {object} puzzleRepo — write-proxied SqlitePuzzleRepository
 * @property {object} settingsRepo
 * @property {object} repertoireRepo — write-proxied SqliteRepertoireRepository
 * @property {Function} handleMessage — (ws, rawJson) => Promise<void>
 * @property {Function} send — (ws, type, payload) => Promise<void>
 * @property {Function} newWs — () => FakeWs
 * @property {Function} advanceClock — (ms: number) => void
 */

/**
 * Create a journey harness.
 *
 * @param {object} [opts]
 * @param {string}  [opts.dbPath=':memory:']  — SQLite path (NEVER data/chess.db)
 * @param {number}  [opts.startMs]            — epoch ms for the simulated start date
 * @param {number}  [opts.cp=30]              — centipawn score for the fake engine
 * @returns {JourneyHarness}
 */
export function createJourneyHarness({ dbPath = ':memory:', startMs, cp = 30 } = {}) {
  // Guard against accidentally opening the real research DB
  if (dbPath.includes('chess.db')) {
    throw new Error('Journey harness: refusing to open chess.db — the 0-game preregistration window must be preserved');
  }

  // Epoch for "day 1" of the journey: 2025-01-06T08:00:00Z (arbitrary fixed date)
  const _startMs = startMs ?? Date.UTC(2025, 0, 6, 8, 0, 0);
  const clock = new FixedClock(_startMs);
  const scheduler = new ManualTimer();
  const enginePool = createFakeEnginePool({ cp });

  const db = openDb(dbPath);
  const app = createApp({ db, clock, scheduler, enginePool });

  const gameRepo       = createWriteProxy(app.gameRepo);
  const puzzleRepo     = createWriteProxy(app.puzzleRepo);
  const repertoireRepo = createWriteProxy(app.repertoireRepo);
  const { settingsRepo } = app;

  // Set a default ELO so analysis does not crash on missing setting
  settingsRepo.set('elo', '1200');

  /**
   * Wire game_finished → analyseGame for a specific ws connection.
   * Must be called whenever a new FakeWs is created for a game that
   * should trigger analysis (all ranked or interest games).
   */
  function wireAnalysis(ws) {
    ws.once('game_finished', ({ session, result }) => {
      analyseGame({
        gameId: session.id,
        session,
        result,
        ws,
        gameRepo,
        puzzleRepo,
        settingsRepo,
        enginePool,
        repertoireRepo,
        clock,
      }).catch(err => {
        // Surface analysis errors as explicit test failures
        throw new Error(`analyseGame failed for game ${session.id}: ${err.message}`);
      });
    });
  }

  /**
   * Create a fresh FakeWs, wired for analysis.
   * Call once per game; don't reuse across games.
   */
  function newWs() {
    const ws = new FakeWs();
    wireAnalysis(ws);
    return ws;
  }

  /**
   * Send a message to the handler and await completion.
   * @param {FakeWs} ws
   * @param {object} payload
   */
  async function send(ws, payload) {
    await app.handleMessage(ws, JSON.stringify(payload));
  }

  /**
   * Advance the clock by the given number of milliseconds.
   * Does NOT run maintenance — call runMaintenance() separately.
   */
  function advanceClock(ms) {
    clock.advance(ms);
  }

  return {
    clock,
    scheduler,
    enginePool,
    db,
    gameRepo,
    puzzleRepo,
    settingsRepo,
    repertoireRepo,
    handleMessage: app.handleMessage,
    send,
    newWs,
    advanceClock,
  };
}

/** Convenience: advance clock by N full days (86_400_000 ms each). */
export function advanceDays(harness, n) {
  harness.advanceClock(n * 86_400_000);
}
