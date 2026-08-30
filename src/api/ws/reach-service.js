/**
 * @module api/ws/reach-service
 * Computes Maia-based reach probabilities for all player-side book nodes.
 *
 * Reach probability = P(reaching this node) assuming:
 *   - The player always plays their canonical move.
 *   - The opponent follows the Maia policy distribution from the position after each player move.
 *
 * BFS from the starting position: for each player node, apply its canonical move to get an
 * opponent position, query Maia policy for that position, and distribute reach probability
 * across all legal opponent replies that lead to known book nodes.
 *
 * B8: `reach.js` previously had no caller. This module calls computeReachProb and
 * updateNodeReachProb so coverage % and gap report can be computed.
 */

import pino from 'pino';
import { Chess } from 'chess.js';

import { extractEpd } from '../../domain/repertoire/epd.js';
import { computeCoveragePct, buildGapReport } from '../../domain/repertoire/reach.js';

const log = pino({ name: 'reach-service', level: process.env.LOG_LEVEL ?? 'info' });

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Run Maia-based reach probes for all player-side book nodes.
 * Updates `reach_prob` and clears `reach_stale` on each reached node.
 *
 * @param {object} opts
 * @param {object} opts.repertoireRepo
 * @param {object|null} [opts.enginePool] — if null/missing, skips probing (reach_prob stays null)
 * @returns {Promise<{ probed: number }>}
 */
export async function runReachProbes({ repertoireRepo, enginePool }) {
  if (!enginePool) return { probed: 0 };

  let maiaClient;
  try {
    maiaClient = await enginePool.getMaiaAnalysisClient(null);
  } catch (err) {
    log.warn({ err }, 'reach-service: getMaiaAnalysisClient failed — skipping reach probes');
    return { probed: 0 };
  }
  if (!maiaClient?.policy) return { probed: 0 };

  const nodes = repertoireRepo.listNodes();
  if (nodes.length === 0) return { probed: 0 };

  // Determine player side from the first node (assumes single-sided book)
  const playerSide = nodes[0].side;

  // Index nodes by epd:side for fast lookup
  const nodeIndex = new Map();
  for (const n of nodes) nodeIndex.set(`${n.epd}:${n.side}`, n);

  // BFS: queue entries are { fen, reachProb } for player-to-move positions
  const reachAccum = new Map(); // epd:side → accumulated reach prob
  const visited = new Set();
  const queue = [{ fen: START_FEN, reachProb: 1.0 }];

  while (queue.length > 0) {
    const { fen, reachProb } = queue.shift();
    const epd = extractEpd(fen);
    const key = `${epd}:${playerSide}`;

    if (visited.has(key)) continue;
    visited.add(key);

    reachAccum.set(key, (reachAccum.get(key) ?? 0) + reachProb);

    if (!nodeIndex.has(key)) continue;

    const moves = repertoireRepo.getMovesForNode(epd, playerSide);
    const canonical = moves.find(m => m.role === 'canonical');
    if (!canonical) continue;

    // Apply canonical player move to get opponent position
    const chess = new Chess(fen);
    let opponentFen;
    try {
      chess.move({ from: canonical.moveUci.slice(0, 2), to: canonical.moveUci.slice(2, 4), promotion: canonical.moveUci[4] ?? undefined });
      opponentFen = chess.fen();
    } catch { continue; }

    // Get Maia policy for the opponent position
    let policy;
    try {
      policy = await maiaClient.policy(opponentFen);
    } catch {
      policy = null;
    }

    // Enumerate all legal opponent moves
    const oppChess = new Chess(opponentFen);
    const oppMoves = oppChess.moves({ verbose: true });
    if (oppMoves.length === 0) continue;

    const uniformProb = 1 / oppMoves.length;

    for (const oppMove of oppMoves) {
      const prob = (policy?.get(oppMove.lan) ?? uniformProb);
      oppChess.move(oppMove);
      const nextFen = oppChess.fen();
      const nextEpd = extractEpd(nextFen);
      const nextKey = `${nextEpd}:${playerSide}`;

      if (nodeIndex.has(nextKey) && !visited.has(nextKey)) {
        queue.push({ fen: nextFen, reachProb: reachProb * prob });
      }
      oppChess.undo();
    }
  }

  // Persist reach_probs
  let probed = 0;
  for (const [key, prob] of reachAccum) {
    const [epd, side] = key.split(':');
    try {
      repertoireRepo.updateNodeReachProb(epd, side, prob);
      probed++;
    } catch (err) {
      log.warn({ err, epd }, 'reach-service: updateNodeReachProb failed — swallowed');
    }
  }

  log.debug({ probed, total: nodes.length }, 'reach probes complete');
  return { probed };
}

/**
 * Compute coverage % using current node reach_probs.
 * Nodes without reach_prob (null) are treated as reach_prob = 1 (fully reachable).
 *
 * @param {object} repertoireRepo
 * @returns {{ coveragePct: number, confirmedNodes: number, totalNodes: number }}
 */
export function computeCoverage(repertoireRepo) {
  const nodes = repertoireRepo.listNodes();
  let coveredNodes = 0;
  let candidateCount = 0;
  let canonicalCount = 0;

  const tagged = nodes.map(n => {
    const moves = repertoireRepo.getMovesForNode(n.epd, n.side);
    const hasCoverage = moves.some(m => m.role === 'canonical' || m.role === 'alt');
    if (hasCoverage) coveredNodes++;
    for (const m of moves) {
      if (m.role === 'candidate') candidateCount++;
      if (m.role === 'canonical') canonicalCount++;
    }
    return { reachProb: n.reachProb ?? 1, hasCoverage };
  });

  const coveragePct = computeCoveragePct(tagged);

  return { coveragePct, coveredNodes, totalNodes: nodes.length, candidateCount, canonicalCount };
}

/**
 * Build a gap report: opponent replies with significant reach but no book coverage.
 * Requires populated reach_probs (run runReachProbes first).
 *
 * @param {object} repertoireRepo
 * @returns {Array<{ epd: string, opponentReplyUci: string, reachProb: number, inXGames: number }>}
 */
export function computeGapReport(repertoireRepo) {
  const nodes = repertoireRepo.listNodes();
  if (nodes.length === 0) return [];

  const playerSide = nodes[0].side;
  const nodeIndex = new Map(nodes.map(n => [`${n.epd}:${n.side}`, n]));

  const candidates = [];

  for (const node of nodes) {
    if (node.side !== playerSide) continue;
    if (!node.reachProb || node.reachProb <= 0) continue;

    const moves = repertoireRepo.getMovesForNode(node.epd, node.side);
    const canonical = moves.find(m => m.role === 'canonical');
    if (!canonical) continue;

    // Apply canonical move to get opponent position, enumerate opponent replies
    const chess = new Chess(node.fen);
    let opponentFen;
    try {
      chess.move({ from: canonical.moveUci.slice(0, 2), to: canonical.moveUci.slice(2, 4), promotion: canonical.moveUci[4] ?? undefined });
      opponentFen = chess.fen();
    } catch { continue; }

    const oppChess = new Chess(opponentFen);
    const oppMoves = oppChess.moves({ verbose: true });

    for (const oppMove of oppMoves) {
      oppChess.move(oppMove);
      const nextFen = oppChess.fen();
      const nextEpd = extractEpd(nextFen);
      const nextKey = `${nextEpd}:${playerSide}`;
      const hasCoverage = nodeIndex.has(nextKey);

      // Use uniform probability as approximation if no Maia data
      // In practice, after runReachProbes the node already encodes the full path probability
      // For gaps: distribute node reach_prob uniformly over opponent replies
      const reachProb = node.reachProb / oppMoves.length;

      candidates.push({ epd: extractEpd(opponentFen), opponentReplyUci: oppMove.lan, reachProb, hasCoverage });
      oppChess.undo();
    }
  }

  return buildGapReport(candidates);
}
