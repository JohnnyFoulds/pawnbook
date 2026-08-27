/**
 * @module domain/game/elo
 * Standard Elo rating with FIDE ±400 diff clamp and K-factor tiers.
 */

import { ELO_DIFF_CLAMP, ELO_FLOOR, K_PROVISIONAL, K_MID, K_HIGH, K_PROVISIONAL_GAMES, K_MID_ELO_MAX } from '../../shared/balance.js';

/**
 * @param {{ gamesPlayed: number, myElo: number }} opts
 * @returns {number}
 */
export function kFactor({ gamesPlayed, myElo }) {
  if (gamesPlayed < K_PROVISIONAL_GAMES) return K_PROVISIONAL;
  if (myElo < K_MID_ELO_MAX) return K_MID;
  return K_HIGH;
}

/**
 * Expected score for the player against an opponent.
 * Rating difference is clamped to ±ELO_DIFF_CLAMP before applying the formula.
 * @param {number} myElo
 * @param {number} oppElo
 * @returns {number} ∈ (0, 1)
 */
export function expectedScore(myElo, oppElo) {
  const diff = Math.max(-ELO_DIFF_CLAMP, Math.min(ELO_DIFF_CLAMP, oppElo - myElo));
  return 1 / (1 + Math.pow(10, diff / 400));
}

/**
 * Compute the new Elo after a game.
 * @param {{ myElo: number, oppElo: number, score: number, gamesPlayed: number }} opts
 * @returns {{ newElo: number, delta: number }}
 */
export function updateElo({ myElo, oppElo, score, gamesPlayed }) {
  if (score !== 0 && score !== 0.5 && score !== 1) {
    throw new Error(`Invalid score: ${score}. Must be 0, 0.5, or 1.`);
  }
  const K = kFactor({ gamesPlayed, myElo });
  const exp = expectedScore(myElo, oppElo);
  const delta = Math.round(K * (score - exp));
  return { newElo: Math.max(ELO_FLOOR, myElo + delta), delta };
}

/**
 * Assert that an opponent can produce a ranked game (must have a known Elo).
 * @param {{ oppElo: number | null }} opts
 * @throws if oppElo is null
 */
export function validateRanked({ oppElo }) {
  if (oppElo === null || oppElo === undefined) {
    throw new Error('Opponent has no Elo rating — cannot play a ranked game.');
  }
}
