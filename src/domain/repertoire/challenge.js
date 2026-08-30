/**
 * @module domain/repertoire/challenge
 * Challenge resolution rules (§FR-REP-CHAL-4).
 * Pure functions — no I/O. Evaluates the numbered rules in order; first match wins.
 *
 * engine_delta = winPct(challenger) − winPct(incumbent)
 * Positive = challenger is better. Neutral band: [−TOL, +CLEAR) = [−3, +2).
 */

import {
  REP_CONFIRM_OBS,
  REP_CHALLENGE_ENGINE_CLEAR,
  REP_CHALLENGE_ENGINE_TOL,
  REP_CHALLENGE_REPEAT_CONFIRM,
  REP_CHALLENGE_MIN_GAMES,
  REP_CHALLENGE_RESULT_MARGIN,
  REP_CHALLENGE_TTL_ENCOUNTERS,
} from '../../shared/balance.js';

/**
 * @typedef {'open'|'promoted'|'rejected'|'rejected_unsound'|'abandoned'|'settled_both'} ChallengeStatus
 */

/**
 * Resolution result.
 * @typedef {{ status: ChallengeStatus, rule: string|null }} Resolution
 */

/**
 * Resolve a challenge given accumulated evidence.
 * Precondition: challenger must have ≥ REP_CONFIRM_OBS self-directed observations before any
 * rule may promote it to canonical (invariant 14). Checked here; rule 2 returns 'open' if not met.
 *
 * @param {{
 *   challengerPlays: number,         unprompted plays of challenger (opening refusal + repeats)
 *   incumbentPlays: number,           unprompted plays of incumbent after challenge opened
 *   encountersSinceOpen: number,
 *   challengerObservations: number,   self-directed observations of challenger
 *   engineDelta: number|null,         winPct(challenger) - winPct(incumbent); null = not yet computed
 *   gateVerdict: 'admitted'|'quarantined'|'refused'|null, null = not yet audited
 *   trendChallenger: number|null,     mean win% at +TREND_PLIES, challenger games
 *   trendIncumbent: number|null,
 *   resultChallengerPerf: number|null, Elo-adjusted performance, challenger games
 *   resultChallengerN: number,
 *   resultIncumbentPerf: number|null,
 *   resultIncumbentN: number,
 *   isSuppressed: boolean,            reversal suppression active
 *   qualifiesForAlternation: boolean, both moves meet §FR-REP-LEARN-6 alternation criteria
 * }} evidence
 * @returns {Resolution}
 */
export function resolveChallenge(evidence) {
  const {
    challengerPlays,
    incumbentPlays,
    encountersSinceOpen,
    challengerObservations,
    engineDelta,
    gateVerdict,
    trendChallenger,
    trendIncumbent,
    resultChallengerPerf,
    resultChallengerN,
    resultIncumbentPerf,
    resultIncumbentN,
    isSuppressed,
    qualifiesForAlternation,
  } = evidence;

  // Rule 1 — gate veto
  if (gateVerdict === 'refused') {
    return { status: 'rejected_unsound', rule: '1' };
  }

  // Global precondition: no canonical from fewer than REP_CONFIRM_OBS observations (invariant 14)
  const canPromote = challengerObservations >= REP_CONFIRM_OBS && !isSuppressed;

  // Rule 9 — alternation (checked before single-winner rules)
  if (qualifiesForAlternation) {
    return { status: 'settled_both', rule: '9' };
  }

  // Rule 2 — engine-clear promote
  if (canPromote && engineDelta !== null && engineDelta >= REP_CHALLENGE_ENGINE_CLEAR) {
    return { status: 'promoted', rule: '2' };
  }

  // Rule 3 — repeat-plus-neutral promote (no results needed)
  if (canPromote &&
      challengerPlays >= REP_CHALLENGE_REPEAT_CONFIRM &&
      engineDelta !== null &&
      engineDelta >= -REP_CHALLENGE_ENGINE_TOL) {
    return { status: 'promoted', rule: '3' };
  }

  // Rule 4 — evidence promote (trend or result, within engine tolerance)
  if (canPromote &&
      engineDelta !== null &&
      engineDelta >= -REP_CHALLENGE_ENGINE_TOL) {
    const hasTrend = trendChallenger !== null && trendIncumbent !== null &&
                     trendChallenger > trendIncumbent;
    const hasResult = resultChallengerN >= REP_CHALLENGE_MIN_GAMES &&
                      resultChallengerPerf !== null &&
                      resultIncumbentPerf !== null &&
                      (resultChallengerPerf - resultIncumbentPerf) >= REP_CHALLENGE_RESULT_MARGIN;
    if ((hasTrend || hasResult) &&
        Math.max(resultChallengerN, resultIncumbentN) >= REP_CHALLENGE_MIN_GAMES) {
      return { status: 'promoted', rule: '4' };
    }
  }

  // Rule 5 — style-call: engine dislikes but gates pass and results support
  if (canPromote &&
      gateVerdict === 'admitted' &&
      engineDelta !== null &&
      engineDelta < -REP_CHALLENGE_ENGINE_TOL) {
    const hasResult = resultChallengerN >= REP_CHALLENGE_MIN_GAMES &&
                      resultChallengerPerf !== null &&
                      resultIncumbentPerf !== null &&
                      (resultChallengerPerf - resultIncumbentPerf) >= REP_CHALLENGE_RESULT_MARGIN;
    if (hasResult) {
      return { status: 'promoted', rule: '5' };
    }
  }

  // Rule 6 — incumbent wins
  if (incumbentPlays >= 1) {
    return { status: 'rejected', rule: '6' };
  }
  if (resultChallengerN >= REP_CHALLENGE_MIN_GAMES &&
      resultIncumbentN >= REP_CHALLENGE_MIN_GAMES &&
      trendChallenger !== null && trendIncumbent !== null) {
    const trendFavoursIncumbent = trendIncumbent > trendChallenger;
    const resultFavoursIncumbent = resultIncumbentPerf !== null &&
                                   resultChallengerPerf !== null &&
                                   (resultIncumbentPerf - resultChallengerPerf) >= REP_CHALLENGE_RESULT_MARGIN;
    if (trendFavoursIncumbent && resultFavoursIncumbent) {
      return { status: 'rejected', rule: '6' };
    }
  }

  // Rule 7 — abandoned at TTL encounters
  if (encountersSinceOpen >= REP_CHALLENGE_TTL_ENCOUNTERS) {
    return { status: 'abandoned', rule: '7' };
  }

  // Rule 8 — still open
  return { status: 'open', rule: null };
}

/**
 * Compute the Elo-adjusted performance score for one game.
 * @param {number} score — 1 (win), 0.5 (draw), 0 (loss)
 * @param {number} opponentElo
 * @param {number} playerElo
 * @returns {number}
 */
export function eloAdjustedPerf(score, opponentElo, playerElo) {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  return score - expected;
}
