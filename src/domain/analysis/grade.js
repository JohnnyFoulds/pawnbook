/**
 * @module domain/analysis/grade
 * Move grading formulas from lichess (scalachess eval.scala + lila Advice.scala).
 * All thresholds in win% POINTS (0–100), never winningChances (−1..+1).
 */

import { BLUNDER_WIN_PTS, MISTAKE_WIN_PTS, INACCURACY_WIN_PTS } from '../../shared/balance.js';

const CP_CLAMP = 1000;
const WC_K = 0.00368208;

/**
 * Convert centipawns to winning-chances ∈ [−1, +1] (White's POV).
 * @param {number} cp — centipawns; Infinity / −Infinity treated as mate
 * @returns {number}
 */
export function winningChances(cp) {
  const clamped = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, isFinite(cp) ? cp : Math.sign(cp) * CP_CLAMP));
  return Math.max(-1, Math.min(1, 2 / (1 + Math.exp(-WC_K * clamped)) - 1));
}

/**
 * Convert centipawns to win% ∈ [0, 100] (White's POV).
 * @param {number} cp
 * @returns {number}
 */
export function winPct(cp) {
  return 50 + 50 * winningChances(cp);
}

/**
 * Classify a move given its win% loss and cp loss (mover's POV).
 * @param {number} winLoss — win% POINTS lost by the mover (positive = worse)
 * @param {number} cpLoss — centipawn loss (positive = worse)
 * @param {{wasMate?: boolean, mateMissed?: boolean, cpBefore?: number}} [opts]
 * @returns {{classification: string}}
 */
export function classify(winLoss, cpLoss, opts = {}) {
  const { wasMate = false, mateMissed = false, cpBefore = 0 } = opts;

  if (wasMate && winLoss >= BLUNDER_WIN_PTS) {
    return { classification: 'blunder' };
  }

  if (mateMissed && winLoss >= BLUNDER_WIN_PTS) {
    // downgrade to mistake if the position was already lost (< −700cp)
    if (cpBefore < -700) return { classification: 'mistake' };
    return { classification: 'blunder' };
  }

  if (winLoss >= BLUNDER_WIN_PTS) return { classification: 'blunder' };
  if (winLoss >= MISTAKE_WIN_PTS) return { classification: 'mistake' };
  if (winLoss >= INACCURACY_WIN_PTS) return { classification: 'inaccuracy' };

  // sub-inaccuracy: grade by cp loss
  if (cpLoss === 0) return { classification: 'best' };
  if (cpLoss < 25) return { classification: 'great' };
  if (cpLoss < 50) return { classification: 'good' };
  return { classification: 'ok' };
}

/**
 * Per-move accuracy (0–100) from the lichess formula.
 * @param {number} winBefore — mover's win% before the move
 * @param {number} winAfter — mover's win% after the move
 * @returns {number}
 */
export function moveAccuracy(winBefore, winAfter) {
  if (winAfter >= winBefore) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (winBefore - winAfter))
    - 3.166924740191411;
  return Math.max(1, Math.min(100, raw));
}

/**
 * Game accuracy = mean of harmonic mean and volatility-weighted mean of per-move accuracies.
 * @param {number[]} accs — array of per-move accuracies (0–100)
 * @returns {number}
 */
export function gameAccuracy(accs) {
  if (!accs.length) return 0;

  // Harmonic mean
  const harmonic = accs.length / accs.reduce((sum, a) => sum + 1 / Math.max(1, a), 0);

  // Volatility-weighted mean: weight each move by how much the position swung
  // Using simple std-dev as a volatility proxy here; equal weights when variance is 0
  const mean = accs.reduce((s, a) => s + a, 0) / accs.length;
  const variance = accs.reduce((s, a) => s + (a - mean) ** 2, 0) / accs.length;
  const volatility = Math.sqrt(variance) || 1;

  // Weighted mean (moves further from average get higher weight)
  const weights = accs.map(a => 1 + Math.abs(a - mean) / volatility);
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const weighted = accs.reduce((s, a, i) => s + a * weights[i], 0) / weightSum;

  return Math.max(1, Math.min(100, (harmonic + weighted) / 2));
}
