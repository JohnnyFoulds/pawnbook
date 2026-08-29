/**
 * @module domain/repertoire/vote
 * Recency-weighted canonical move selection.
 * Only self-directed observations (source ≠ 'coach_corrected') count.
 */

import { REP_RECENCY_HALFLIFE_DAYS, REP_ALT_ALTERNATION_MIN } from '../../shared/balance.js';

const LN2 = Math.LN2;

/**
 * Compute the recency weight for an observation given its age in days.
 * @param {number} ageDays
 * @returns {number}
 */
export function recencyWeight(ageDays) {
  return Math.exp(-LN2 * ageDays / REP_RECENCY_HALFLIFE_DAYS);
}

/**
 * Elect the canonical move from a set of move stats.
 *
 * @param {Array<{
 *   uci: string,
 *   observations: {playedAt: number, weight: number}[],  // self-directed only
 *   meanWinLossPts: number,
 *   score: number,   // W + 0.5·D in fractional points
 * }>} moves
 * @param {number} nowMs — current time in epoch ms (passed in; no Date.now() calls in domain)
 * @returns {{ canonical: string|null, alts: string[] }}
 *   canonical is null if no moves have observations; alts are moves that qualify alongside canonical
 */
export function electCanonical(moves, nowMs) {
  if (!moves.length) return { canonical: null, alts: [] };

  const halfLifeMs = REP_RECENCY_HALFLIFE_DAYS * 86400_000;

  const scored = moves.map(m => {
    const weightedScore = m.observations.reduce((sum, obs) => {
      const ageDays = (nowMs - obs.playedAt) / 86400_000;
      return sum + recencyWeight(ageDays);
    }, 0);
    return { uci: m.uci, weightedScore, meanWinLossPts: m.meanWinLossPts, score: m.score };
  }).filter(m => m.weightedScore > 0);

  if (!scored.length) return { canonical: null, alts: [] };

  scored.sort((a, b) =>
    b.weightedScore - a.weightedScore ||
    a.meanWinLossPts - b.meanWinLossPts ||
    b.score - a.score
  );

  const winner = scored[0];

  // Alternation: check if a second move qualifies alongside the winner
  const alts = [];
  for (let i = 1; i < scored.length; i++) {
    const m = moves.find(x => x.uci === scored[i].uci);
    if (!m) continue;
    // Count observations within one half-life of nowMs
    const recentCount = m.observations.filter(o => (nowMs - o.playedAt) <= halfLifeMs).length;
    const winnerRecentCount = moves.find(x => x.uci === winner.uci)
      ?.observations.filter(o => (nowMs - o.playedAt) <= halfLifeMs).length ?? 0;
    if (recentCount >= REP_ALT_ALTERNATION_MIN && winnerRecentCount >= REP_ALT_ALTERNATION_MIN) {
      alts.push(scored[i].uci);
    }
  }

  return { canonical: winner.uci, alts };
}
