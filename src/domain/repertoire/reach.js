/**
 * @module domain/repertoire/reach
 * Reach probability and coverage computation.
 * Reach probability of a node = Π of maiaPolicy(opponentReply) over all opponent-to-move positions
 * on the path. Own moves are probability 1 (we always play our book move).
 */

import { REP_COVERAGE_GOAL } from '../../shared/balance.js';

/**
 * Compute reach probability for a node given the opponent-ply policy probabilities along its path.
 * @param {number[]} opponentProbabilities — Maia policy probability for each opponent move on path
 * @returns {number} — probability in [0, 1]
 */
export function computeReachProb(opponentProbabilities) {
  return opponentProbabilities.reduce((p, prob) => p * prob, 1);
}

/**
 * Coverage %: fraction of expected moves that will find a canonical node.
 * @param {Array<{ reachProb: number, hasCoverage: boolean }>} nodes
 * @returns {number} — percentage 0–100
 */
export function computeCoveragePct(nodes) {
  let totalReach = 0;
  let coveredReach = 0;
  for (const n of nodes) {
    totalReach += n.reachProb;
    if (n.hasCoverage) coveredReach += n.reachProb;
  }
  if (totalReach === 0) return 0;
  return (coveredReach / totalReach) * 100;
}

/**
 * Expected in-book depth: the expected ply at which the next game leaves the book.
 * @param {Array<{ ply: number, reachProb: number, hasCoverage: boolean }>} nodes
 * @returns {number}
 */
export function computeExpectedDepth(nodes) {
  // For each ply, the probability of being in-book at that ply contributes ply * probability
  // to the expectation, weighted by reach.
  const byPly = new Map();
  for (const n of nodes) {
    if (!n.hasCoverage) continue;
    if (!byPly.has(n.ply)) byPly.set(n.ply, 0);
    byPly.set(n.ply, byPly.get(n.ply) + n.reachProb);
  }
  let sumWeighted = 0;
  let sumReach = 0;
  for (const [ply, reach] of byPly) {
    sumWeighted += ply * reach;
    sumReach += reach;
  }
  if (sumReach === 0) return 0;
  return sumWeighted / sumReach;
}

/**
 * Determine whether a node is within the "worth covering" frontier.
 * @param {number} reachProb
 * @returns {boolean}
 */
export function isInFrontier(reachProb) {
  return reachProb >= 1 / REP_COVERAGE_GOAL;
}

/**
 * Build a gap report: opponent replies with significant reach that have no book coverage.
 * @param {Array<{
 *   epd: string,
 *   opponentReplyUci: string,
 *   reachProb: number,
 *   hasCoverage: boolean,
 * }>} candidates
 * @returns {Array<{ epd: string, opponentReplyUci: string, reachProb: number, inXGames: number }>}
 *   sorted by reach descending
 */
export function buildGapReport(candidates) {
  return candidates
    .filter(c => !c.hasCoverage && isInFrontier(c.reachProb))
    .map(c => ({
      epd: c.epd,
      opponentReplyUci: c.opponentReplyUci,
      reachProb: c.reachProb,
      inXGames: Math.round(1 / c.reachProb),
    }))
    .sort((a, b) => b.reachProb - a.reachProb);
}
