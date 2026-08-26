/**
 * @module api/routes/games
 * GET /api/games               — game list
 * GET /api/games/:id/review    — move evals + accuracy for review page
 * GET /api/games/:id/quiz      — ordered puzzle positions for quiz
 */

import { Router } from 'express';

/**
 * @param {object} deps
 * @param {import('../../ports/repositories.js').GameRepository} deps.gameRepo
 * @param {import('../../ports/repositories.js').PuzzleRepository} deps.puzzleRepo
 * @returns {Router}
 */
export function gamesRouter({ gameRepo, puzzleRepo }) {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const games = gameRepo.listRecent(50);
      res.json({ games });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/review', (req, res, next) => {
    try {
      const game = gameRepo.findById(req.params.id);
      const evals = gameRepo.getEvals(req.params.id);
      const puzzles = puzzleRepo.listByGame(req.params.id);
      res.json({ game, evals, puzzles });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/quiz', (req, res, next) => {
    try {
      const puzzles = puzzleRepo.listByGame(req.params.id);
      // Order by source_ply ascending so the quiz follows game order
      const ordered = [...puzzles].sort((a, b) => (a.sourcePly ?? a.source_ply ?? 0) - (b.sourcePly ?? b.source_ply ?? 0));
      res.json({ puzzles: ordered });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
