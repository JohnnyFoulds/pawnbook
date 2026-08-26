/**
 * @module api/routes/state
 * GET /api/state — lightweight app state for the dashboard and TUI.
 * Used as the healthcheck endpoint in the Dockerfile.
 */

import { Router } from 'express';

/**
 * @param {object} deps
 * @param {import('../../ports/repositories.js').SettingsRepository} deps.settingsRepo
 * @param {import('../../ports/repositories.js').PuzzleRepository} deps.puzzleRepo
 * @param {import('../../ports/clock.js').Clock} deps.clock
 * @returns {Router}
 */
export function stateRouter({ settingsRepo, puzzleRepo, clock }) {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const elo = parseInt(settingsRepo.get('elo') ?? '1200', 10);
      const showStreak = settingsRepo.get('show_streak') !== '0';

      const now = clock.now().getTime();
      const dueCards = puzzleRepo.getDueCards(now);
      const dueCount = dueCards.length;

      // Streak: derive from activity table (number of consecutive days with activity)
      let streak = 0;
      try {
        streak = parseInt(settingsRepo.get('streak_cache') ?? '0', 10);
      } catch {
        streak = 0;
      }

      res.json({
        elo,
        dueCount,
        showStreak,
        streak,
        status: 'ok',
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
