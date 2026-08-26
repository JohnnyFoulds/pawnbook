/**
 * @module api/routes/opponents
 * GET /api/opponents — list available opponents.
 */

import { Router } from 'express';

import { getAvailableOpponents } from '../../domain/game/roster.js';

export function opponentsRouter() {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const opponents = getAvailableOpponents();
      res.json({ opponents });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
