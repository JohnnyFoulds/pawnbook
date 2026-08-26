/**
 * @module server
 * Composition root. Builds adapters, mounts routes, starts the HTTP + WS server.
 * No business logic here — this module only wires up what is already built.
 */

import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import express from 'express';

import { openDb, SqliteGameRepository, SqlitePuzzleRepository, SqliteSettingsRepository } from './adapters/sqlite/repositories.js';
import { SystemClock } from './adapters/clock/system-clock.js';
import { FsrsScheduler } from './adapters/scheduler/fsrs-scheduler.js';
import { errorMiddleware } from './api/error-middleware.js';
import { opponentsRouter } from './api/routes/opponents.js';
import { gamesRouter } from './api/routes/games.js';
import { puzzlesRouter } from './api/routes/puzzles.js';
import { statsRouter } from './api/routes/stats.js';
import { stateRouter } from './api/routes/state.js';
import { attachWebSocketServer } from './api/ws/connection.js';
import { PORT, BIND_ADDR, DB_PATH, logger } from './config.js';
import { initTelemetry } from './telemetry.js';

const log = logger.child({ mod: 'server' });
const __dirname = dirname(fileURLToPath(import.meta.url));

async function start() {
  await initTelemetry();

  // ── Adapters ──────────────────────────────────────────────────────────────
  const db          = openDb(DB_PATH);
  const gameRepo    = new SqliteGameRepository(db);
  const puzzleRepo  = new SqlitePuzzleRepository(db);
  const settingsRepo = new SqliteSettingsRepository(db);
  const clock       = new SystemClock();
  const scheduler   = new FsrsScheduler();

  // Verify settings.elo is consistent with elo_history
  const history = gameRepo.getEloHistory();
  if (history.length > 0) {
    const latestElo = history[history.length - 1].elo;
    const storedElo = parseInt(settingsRepo.get('elo') ?? '0', 10);
    if (storedElo !== latestElo) {
      log.error({ storedElo, latestElo }, 'settings.elo disagrees with elo_history — re-deriving');
      settingsRepo.set('elo', String(latestElo));
    }
  }

  if (!['127.0.0.1', '::1', 'localhost'].includes(BIND_ADDR)) {
    log.warn({ BIND_ADDR }, 'binding to non-loopback address — this app has no authentication');
  }

  // ── Express app ───────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  // Serve src/shared/ as /shared/ so browser ES modules can import quality.js etc.
  app.use('/shared', express.static(join(__dirname, 'shared')));

  // Serve public/ as static files
  app.use(express.static(join(__dirname, '..', 'public')));

  // REST routes
  app.use('/api/opponents', opponentsRouter());
  app.use('/api/games',     gamesRouter({ gameRepo, puzzleRepo }));
  app.use('/api/puzzles',   puzzlesRouter({ puzzleRepo, scheduler, clock, settingsRepo }));
  app.use('/api/stats',     statsRouter({ gameRepo, puzzleRepo, settingsRepo, clock }));
  app.use('/api/state',     stateRouter({ settingsRepo, puzzleRepo, clock }));

  app.use(errorMiddleware);

  // ── HTTP + WS server ─────────────────────────────────────────────────────
  const httpServer = createServer(app);

  attachWebSocketServer({ httpServer, gameRepo, clock, enginePool: null });

  httpServer.listen(PORT, BIND_ADDR, () => {
    log.info({ port: PORT, bind: BIND_ADDR }, 'pawnbook listening');
  });
}

start().catch((err) => {
  logger.error({ err }, 'startup failed');
  process.exit(1);
});
