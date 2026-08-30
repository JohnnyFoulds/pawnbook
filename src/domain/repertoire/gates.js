/**
 * @module domain/repertoire/gates
 * The four soundness gates for admitting a move into the repertoire.
 * All inputs are in win% POINTS (0–100), mover's POV, matching move_evals column names.
 * Returns one of: 'admitted' | 'quarantined' | 'refused'
 */

import {
  REP_ADMIT_WIN_PTS,
  REP_QUARANTINE_WIN_PTS,
  REP_MIN_ABS_WIN_PCT,
  REP_LINE_BUDGET_WIN_PTS,
} from '../../shared/balance.js';

/**
 * @typedef {'admitted'|'quarantined'|'refused'} GateVerdict
 */

/**
 * Run all four gates and return the verdict plus the reason for any non-admission.
 *
 * @param {{
 *   winLossPts: number,       gate 1 — win% points lost vs engine best
 *   winAfter: number,         gate 2 — mover's win% after the move
 *   bestMoveWinAfter: number, gate 2 — win% if the best move were played instead
 *   lineLoss: number|null,    gate 3 — cumulative line loss to this node (null = no path yet)
 *   isForcedMate: boolean,    gate 4 — position is a forced mate against the mover
 * }} input
 * @returns {{ verdict: GateVerdict, reason: string|null }}
 */
export function runGates({ winLossPts, winAfter, bestMoveWinAfter, lineLoss, isForcedMate }) {
  // Gate 4: forced mate
  if (isForcedMate) {
    return { verdict: 'refused', reason: 'forced_mate' };
  }

  // Gate 1: per-move loss
  if (winLossPts >= REP_QUARANTINE_WIN_PTS) {
    return { verdict: 'refused', reason: 'per_move_loss' };
  }

  // Gate 2: absolute floor — skip when the best move also cannot reach the floor
  if (bestMoveWinAfter >= REP_MIN_ABS_WIN_PCT && winAfter < REP_MIN_ABS_WIN_PCT) {
    return { verdict: 'refused', reason: 'absolute_floor' };
  }

  // Gate 3: cumulative line budget — skip when no book path exists yet
  if (lineLoss !== null && lineLoss >= REP_LINE_BUDGET_WIN_PTS) {
    return { verdict: 'refused', reason: 'line_budget' };
  }

  // Quarantine zone: [10, 20)
  if (winLossPts >= REP_ADMIT_WIN_PTS) {
    return { verdict: 'quarantined', reason: 'quarantine_zone' };
  }

  return { verdict: 'admitted', reason: null };
}
