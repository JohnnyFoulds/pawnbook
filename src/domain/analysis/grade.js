/**
 * @module domain/analysis/grade
 * Move grading formulas from lichess (scalachess eval.scala + lila Advice.scala).
 * All thresholds in win% POINTS (0–100), never winningChances (−1..+1).
 */

import {
  BLUNDER_WIN_PTS, MISTAKE_WIN_PTS, INACCURACY_WIN_PTS, GREAT_CP_MAX, GOOD_CP_MAX,
  STRENGTH_CP_CAP, STRENGTH_DECIDED_CP, STRENGTH_MIN_PLIES,
  STRENGTH_ANCHOR_ELO, STRENGTH_ANCHOR_ASE, STRENGTH_ELO_PER_ASE,
  STRENGTH_ELO_MIN, STRENGTH_ELO_MAX,
} from '../../shared/balance.js';

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
  if (cpLoss < GREAT_CP_MAX) return { classification: 'great' };
  if (cpLoss < GOOD_CP_MAX) return { classification: 'good' };
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
/**
 * Regan & Haworth scaled error for one ply: ln(1 + min(cpLoss, cap) / 100).
 * @param {number} cpLoss — centipawn loss (non-negative)
 * @returns {number}
 */
export function scaledError(cpLoss) {
  return Math.log(1 + Math.min(cpLoss, STRENGTH_CP_CAP) / 100);
}

/**
 * Estimate playing strength from a set of per-ply samples.
 *
 * Each sample must supply the pre-move position's properties:
 *   { cpLoss, cpWhite, mateIn, legalMovesBefore }
 *
 * Eligible plies: legalMovesBefore > 1, mateIn === null,
 *   cpWhite !== null, |cpWhite| <= STRENGTH_DECIDED_CP.
 *
 * @param {Array<{cpLoss:number, cpWhite:number|null, mateIn:number|null, legalMovesBefore:number}>} samples
 * @returns {{strength:number|null, se:number|null, n:number, ase:number|null, sd:number, p75Loss:number|null}}
 */
export function playingStrength(samples) {
  const eligible = samples.filter(s =>
    s.legalMovesBefore > 1 &&
    s.mateIn === null &&
    s.cpWhite !== null &&
    Math.abs(s.cpWhite) <= STRENGTH_DECIDED_CP,
  );

  const n = eligible.length;

  if (n === 0) return { strength: null, se: null, n: 0, ase: null, sd: 0, p75Loss: null };

  const scaledLosses = eligible.map(s => scaledError(s.cpLoss));
  const ase = scaledLosses.reduce((sum, v) => sum + v, 0) / n;

  // Sample standard deviation (n-1 denominator); defined as 0 for n < 2 to avoid NaN.
  const sd = n < 2
    ? 0
    : Math.sqrt(scaledLosses.reduce((sum, v) => sum + (v - ase) ** 2, 0) / (n - 1));

  // p75Loss: 75th percentile of winsorised cpLoss over eligible plies, ascending.
  const winsorised = eligible.map(s => Math.min(s.cpLoss, STRENGTH_CP_CAP)).sort((a, b) => a - b);
  const idx = 0.75 * (n - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx), frac = idx - lo;
  const p75Loss = winsorised[lo] + frac * (winsorised[hi] - winsorised[lo]);

  if (n < STRENGTH_MIN_PLIES) return { strength: null, se: null, n, ase, sd, p75Loss };

  const raw = STRENGTH_ANCHOR_ELO - STRENGTH_ELO_PER_ASE * (ase - STRENGTH_ANCHOR_ASE);
  const strength = Math.round(Math.max(STRENGTH_ELO_MIN, Math.min(STRENGTH_ELO_MAX, raw)));
  const se = Math.round(STRENGTH_ELO_PER_ASE * sd / Math.sqrt(n));

  return { strength, se, n, ase, sd, p75Loss };
}

const MAIA_LOG_PROB_FLOOR = 0.001;

/**
 * Mean log-probability of the player's moves under Maia-3's conditioned policy.
 * Probability 0 is clamped to MAIA_LOG_PROB_FLOOR to avoid log(0) = -Infinity.
 * @param {number[]} probabilities — P_maia3(played_move) for each eligible ply
 * @returns {{maiaLogProb: number|null, n: number}}
 */
export function maiaLogProb(probabilities) {
  if (!probabilities.length) return { maiaLogProb: null, n: 0 };
  const logProbs = probabilities.map(p => Math.log(Math.max(MAIA_LOG_PROB_FLOOR, p)));
  const mean = logProbs.reduce((s, v) => s + v, 0) / logProbs.length;
  return { maiaLogProb: mean, n: logProbs.length };
}

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
