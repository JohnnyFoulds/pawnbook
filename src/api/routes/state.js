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
 * @param {import('../../ports/repositories.js').GameRepository} deps.gameRepo
 * @param {import('../../ports/clock.js').Clock} deps.clock
 * @returns {Router}
 */
export function stateRouter({ settingsRepo, puzzleRepo, gameRepo, clock }) {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const elo = parseInt(settingsRepo.get('elo') ?? '1200', 10);
      const showStreak = settingsRepo.get('show_streak') !== '0';

      const now = clock.now().getTime();
      const dueCards = puzzleRepo.getDueCards(now);
      const dueCount = dueCards.length;

      let streak = 0;
      try {
        streak = parseInt(settingsRepo.get('streak_cache') ?? '0', 10);
      } catch {
        streak = 0;
      }

      const eloHistory = gameRepo.getEloHistory();
      const eloDelta = eloHistory.length >= 2
        ? eloHistory[eloHistory.length - 1].elo - eloHistory[eloHistory.length - 2].elo
        : null;

      const recentGames = gameRepo.listRecent(8).map((g) => ({
        id: g.id,
        opponentId: g.opponentId,
        result: g.result,
        accuracy: g.accuracy,
        puzzleCount: null,
        playedAt: g.playedAt ? new Date(g.playedAt).toISOString() : null,
      }));

      const finishedGames = gameRepo.listRecent(1000).filter((g) => g.status === 'finished');
      const gamesPlayed = finishedGames.length;

      res.json({
        elo,
        dueCount,
        showStreak,
        streak,
        status: 'ok',
        gamesPlayed,
        eloDelta,
        eloHistory: eloHistory.map((h) => ({ elo: h.elo, recordedAt: h.recordedAt })),
        recentGames,
        suggestedOpponent: null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
