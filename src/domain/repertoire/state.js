/**
 * @module domain/repertoire/state
 * Role transition rules for book moves.
 * All functions are pure — they compute the new role; persistence is the caller's responsibility.
 */

import { REP_ADMIT_WIN_PTS, REP_QUARANTINE_WIN_PTS } from '../../shared/balance.js';

/** All valid roles */
export const ROLES = /** @type {const} */ ([
  'candidate', 'canonical', 'alt', 'challenger', 'quarantined', 'refused', 'retired',
]);

/** Moves in this set never alert when played */
export const ACCEPTED_SET = new Set(['canonical', 'alt', 'challenger', 'quarantined']);

/** Moves in this set alert when played (if the node has a canonical move) */
export const ALERTING_SET = new Set(['refused', 'retired']);

/**
 * Determine the initial role for a move seen for the first time.
 * Always 'candidate' — a single observation never enters the book.
 * @returns {'candidate'}
 */
export function initialRole() {
  return 'candidate';
}

/**
 * Attempt to promote a candidate to its confirmed role, given its gate evaluation.
 * Only called once self-directed observations ≥ REP_CONFIRM_OBS.
 *
 * @param {{ verdict: 'admitted'|'quarantined'|'refused', reason: string|null }} gateResult
 * @param {boolean} isFirstMoveAtNode — if true and verdict is 'admitted', may become canonical
 * @returns {'canonical'|'alt'|'quarantined'|'refused'}
 */
export function promoteCandidate(gateResult, isFirstMoveAtNode) {
  if (gateResult.verdict === 'refused') return 'refused';
  if (gateResult.verdict === 'quarantined') return 'quarantined';
  // admitted
  return isFirstMoveAtNode ? 'canonical' : 'alt';
}

/**
 * Re-audit a quarantined move. Returns its new role.
 * @param {{ winLossPts: number }} eval_ — latest eval for this move
 * @returns {'alt'|'quarantined'|'refused'}
 */
export function reAuditQuarantined({ winLossPts }) {
  if (winLossPts < REP_ADMIT_WIN_PTS) return 'alt';
  if (winLossPts >= REP_QUARANTINE_WIN_PTS) return 'refused';
  return 'quarantined';
}

/**
 * Check whether a candidate has expired without confirming.
 * @param {number} encountersSinceFirst
 * @param {number} ttl — REP_CANDIDATE_TTL_ENCOUNTERS
 * @returns {boolean}
 */
export function candidateExpired(encountersSinceFirst, ttl) {
  return encountersSinceFirst >= ttl;
}
