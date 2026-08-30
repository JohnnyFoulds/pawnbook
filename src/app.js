/**
 * @module app
 * Application factory. Creates all adapters and returns the WebSocket message handler
 * without binding to a port. Used by:
 *   - server.js (thin shell that adds HTTP binding)
 *   - tests/support/journey/harness.js (in-process journey harness)
 *   - scripts/simulate-journey.js (CLI that writes a throwaway DB)
 *
 * This module owns the wiring; all real I/O is injected so tests can substitute
 * in-memory / fake / fixed-clock variants.
 */

import {
  SqliteGameRepository,
  SqlitePuzzleRepository,
  SqliteSettingsRepository,
  SqliteRepertoireRepository,
} from './adapters/sqlite/repositories.js';
import { SystemClock } from './adapters/clock/system-clock.js';
import { RealTimer } from './adapters/scheduler/real-timer.js';
import { makeMessageHandler } from './api/ws/handlers.js';

/**
 * Create the application from an open database connection.
 * Returns the WS message handler plus all repos so callers can make assertions.
 *
 * @param {object} opts
 * @param {import('better-sqlite3').Database} opts.db — open SQLite DB (pass openDb(':memory:') in tests)
 * @param {import('./ports/clock.js').Clock} [opts.clock] — defaults to SystemClock
 * @param {import('./ports/scheduler.js').Scheduler} [opts.scheduler] — defaults to RealTimer
 * @param {object|null} [opts.enginePool] — engine pool; null means no engines (no engine turns)
 * @returns {{
 *   handleMessage: (ws: object, raw: string) => Promise<void>,
 *   gameRepo: SqliteGameRepository,
 *   puzzleRepo: SqlitePuzzleRepository,
 *   settingsRepo: SqliteSettingsRepository,
 *   repertoireRepo: SqliteRepertoireRepository,
 *   clock: import('./ports/clock.js').Clock,
 * }}
 */
export function createApp({ db, clock = null, scheduler = null, enginePool = null }) {
  const gameRepo       = new SqliteGameRepository(db);
  const puzzleRepo     = new SqlitePuzzleRepository(db);
  const settingsRepo   = new SqliteSettingsRepository(db);
  const repertoireRepo = new SqliteRepertoireRepository(db);
  const _clock         = clock     ?? new SystemClock();
  const _scheduler     = scheduler ?? new RealTimer();

  const handleMessage = makeMessageHandler({
    gameRepo,
    settingsRepo,
    clock: _clock,
    scheduler: _scheduler,
    enginePool,
    repertoireRepo,
    puzzleRepo,
  });

  return { handleMessage, gameRepo, puzzleRepo, settingsRepo, repertoireRepo, clock: _clock };
}
