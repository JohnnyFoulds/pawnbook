/**
 * @module api/routes/debug
 * Test-only endpoints. Only mounted when NODE_ENV=test.
 */

import { Router } from 'express';

/**
 * @param {object} deps
 * @param {import('../../ports/repositories.js').GameRepository} deps.gameRepo
 * @returns {Router}
 */
export function debugRouter({ gameRepo }) {
  const router = Router();

  // Abandon all in_progress games so the next test starts with a clean setup panel.
  router.post('/reset', (req, res) => {
    gameRepo.abandonAllInProgress();
    res.json({ ok: true });
  });

  return router;
}
