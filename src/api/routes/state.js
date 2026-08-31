/**
 * @module api/routes/state
 * GET /api/state — lightweight app state for the dashboard and TUI.
 * Used as the healthcheck endpoint in the Dockerfile.
 */

import { Router } from 'express';

import { getRosterTable } from '../../domain/game/roster.js';

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

      const streak = gameRepo.getStreak?.(now) ?? 0;
      const bestStreak = gameRepo.getBestStreak?.() ?? 0;

      const eloHistory = gameRepo.getEloHistory();
      const eloDelta = eloHistory.length >= 2
        ? eloHistory[eloHistory.length - 1].elo - eloHistory[eloHistory.length - 2].elo
        : null;

      const puzzleCountsByGame = puzzleRepo.getPuzzleCountsByGameId?.() ?? {};

      const recentGames = gameRepo.listRecent(8).map((g) => ({
        id: g.id,
        opponentId: g.opponentId,
        result: g.result,
        accuracy: g.accuracy,
        puzzleCount: puzzleCountsByGame[g.id] ?? 0,
        playedAt: g.playedAt ? new Date(g.playedAt).toISOString() : null,
      }));

      const finishedGames = gameRepo.listRecent(1000).filter((g) => g.status === 'finished');
      const gamesPlayed = finishedGames.length;

      const inProgressGame = gameRepo.listRecent(10).find(g => g.status === 'in_progress');

      // Suggest the opponent with ELO closest to the player's current ELO
      let suggestedOpponent = null;
      try {
        const ratedOpponents = getRosterTable().filter(o => o.elo != null);
        if (ratedOpponents.length) {
          const nearest = ratedOpponents.reduce((best, opp) =>
            Math.abs(opp.elo - elo) < Math.abs(best.elo - elo) ? opp : best
          );
          suggestedOpponent = nearest.id;
        }
      } catch { /* non-critical */ }

      res.json({
        elo,
        dueCount,
        showStreak,
        streak,
        bestStreak,
        activityHistory: gameRepo.getActivityHistory?.(30) ?? [],
        status: 'ok',
        gamesPlayed,
        eloDelta,
        eloHistory: eloHistory.map((h) => ({ elo: h.elo, recordedAt: h.recordedAt })),
        recentGames,
        suggestedOpponent,
        inProgressGameId: inProgressGame?.id ?? null,
        inProgressOpponentId: inProgressGame?.opponentId ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
