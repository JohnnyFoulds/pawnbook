/**
 * @module api/routes/stats
 * GET /api/stats — aggregated stats for the stats page and TUI.
 */

import { Router } from 'express';

/**
 * @param {object} deps
 * @param {import('../../ports/repositories.js').GameRepository} deps.gameRepo
 * @param {import('../../ports/repositories.js').PuzzleRepository} deps.puzzleRepo
 * @param {import('../../ports/repositories.js').SettingsRepository} deps.settingsRepo
 * @param {import('../../ports/clock.js').Clock} deps.clock
 * @returns {Router}
 */
export function statsRouter({ gameRepo, puzzleRepo, settingsRepo, clock }) {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const elo = parseInt(settingsRepo.get('elo') ?? '1200', 10);
      const eloHistory = gameRepo.getEloHistory();
      const eloDelta = eloHistory.length >= 2
        ? eloHistory[eloHistory.length - 1].elo - eloHistory[eloHistory.length - 2].elo
        : null;

      const now = clock.now().getTime();
      const allDue = puzzleRepo.getDueCards(now);
      const dueCount = allDue.length;

      // wins / losses / draws from finished ranked games
      const games = gameRepo.listRecent(1000);
      let wins = 0, losses = 0, draws = 0;
      const phaseBreakdown = { opening: 0, middlegame: 0, endgame: 0 };
      for (const g of games) {
        if (g.status !== 'finished') continue;
        if (g.result === 'win') wins++;
        else if (g.result === 'loss') losses++;
        else if (g.result === 'draw') draws++;
      }

      // Phase breakdown from puzzles
      const allPuzzles = puzzleRepo.listAll ? puzzleRepo.listAll() : [];
      let activeCount = 0, graduatedCount = 0;
      for (const p of allPuzzles) {
        if (p.graduated) graduatedCount++;
        else activeCount++;
        if (p.phase && phaseBreakdown[p.phase] !== undefined) {
          phaseBreakdown[p.phase]++;
        }
      }

      res.json({
        elo,
        eloDelta,
        eloHistory: eloHistory.map(h => ({ elo: h.elo, recordedAt: h.recordedAt })),
        dueCount,
        activeCount,
        graduatedCount,
        wins,
        losses,
        draws,
        phaseBreakdown,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
