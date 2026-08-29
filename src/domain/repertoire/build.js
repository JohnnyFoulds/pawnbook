/**
 * @module domain/repertoire/build
 * Post-game book update: pure computation from game data.
 * Returns operations; all I/O is the caller's responsibility.
 */

import { extractEpd, sideFromFen } from './epd.js';
import { runGates } from './gates.js';
import { promoteCandidate, candidateExpired } from './state.js';
import {
  REP_PLY_MAX,
  REP_CONFIRM_OBS,
  REP_CANDIDATE_TTL_ENCOUNTERS,
} from '../../shared/balance.js';

/**
 * Process a finished, analysed game and compute all book operations.
 * Pure — no I/O, no Date.now() calls.
 *
 * @param {object} opts
 * @param {string} opts.gameId
 * @param {string} opts.playerColor
 * @param {string|null} opts.gameResult — 'win'|'loss'|'draw'|null
 * @param {{ ply: number, uci: string, san: string }[]} opts.gameMoves
 * @param {object[]} opts.moveEvals — rows from move_evals
 * @param {object[]} opts.existingNodes — current rep_nodes rows for positions in this game
 * @param {object[]} opts.existingMoves — current rep_moves rows for those nodes
 * @param {number} opts.provenanceId
 * @param {number} opts.bookVersion
 * @param {'game'|'coach_kept'|'coach_corrected'} [opts.source]
 * @param {number} opts.nowMs — injected timestamp
 * @returns {{ observations: object[], nodeUpserts: object[], moveUpserts: object[], changelogEntries: object[] }}
 */
export function processGame({
  gameId,
  playerColor,
  gameResult,
  gameMoves,
  moveEvals,
  existingNodes,
  existingMoves,
  provenanceId,
  bookVersion,
  source = 'game',
  nowMs,
}) {
  // Build lookup maps — working copies, never mutate inputs
  const nodeMap = new Map();
  for (const n of existingNodes) nodeMap.set(`${n.epd}:${n.side}`, { ...n });

  const moveMap = new Map();
  for (const m of existingMoves) moveMap.set(`${m.epd}:${m.side}:${m.moveUci}`, { ...m });

  const evalByPly = new Map();
  for (const e of moveEvals) evalByPly.set(e.ply, e);

  const observations = [];
  const changelogEntries = [];
  let cumulativeLoss = 0;

  for (const move of gameMoves) {
    const { ply } = move;
    if (ply > REP_PLY_MAX) break;

    const eval_ = evalByPly.get(ply);
    if (!eval_) continue;
    if (eval_.mover !== 'player') continue;

    const epd = extractEpd(eval_.fen);
    const side = sideFromFen(eval_.fen);
    const nodeKey = `${epd}:${side}`;
    const moveKey = `${epd}:${side}:${move.uci}`;
    const winLossPts = eval_.win_loss_pts ?? 0;

    cumulativeLoss += winLossPts;

    // ── Upsert node ──────────────────────────────────────────────────────────
    const existingNode = nodeMap.get(nodeKey) ?? null;
    const newEncounters = (existingNode?.encounters ?? 0) + 1;
    const newLineLoss = existingNode?.lineLoss == null
      ? cumulativeLoss
      : Math.min(existingNode.lineLoss, cumulativeLoss);
    nodeMap.set(nodeKey, {
      epd,
      side,
      fen: eval_.fen,
      firstSeen: existingNode?.firstSeen ?? nowMs,
      lastSeen: nowMs,
      timesReached: (existingNode?.timesReached ?? 0) + 1,
      encounters: newEncounters,
      minPly: Math.min(existingNode?.minPly ?? ply, ply),
      reachProb: existingNode?.reachProb ?? null,
      reachStale: true,
      lineLoss: newLineLoss,
      voteFrozenUntilEncounter: existingNode?.voteFrozenUntilEncounter ?? null,
    });

    // ── Append observation ───────────────────────────────────────────────────
    observations.push({
      gameId,
      ply,
      epd,
      side,
      moveUci: move.uci,
      moveSan: move.san,
      winLossPts,
      classification: eval_.classification ?? null,
      playedAt: nowMs,
      source,
      provenanceId,
      bookVersion,
    });

    // coach_corrected observations are recorded but don't advance the book
    if (source === 'coach_corrected') continue;

    // ── Upsert move ──────────────────────────────────────────────────────────
    const existingMove = moveMap.get(moveKey) ?? null;
    const newObs = (existingMove?.observations ?? 0) + 1;

    // Score: each move in this game inherits the game result
    const scoreW = (existingMove?.scoreW ?? 0) + (gameResult === 'win' ? 1 : 0);
    const scoreD = (existingMove?.scoreD ?? 0) + (gameResult === 'draw' ? 1 : 0);
    const scoreL = (existingMove?.scoreL ?? 0) + (gameResult === 'loss' ? 1 : 0);

    const prevMean = existingMove?.meanWinLossPts ?? 0;
    const meanWinLossPts = (prevMean * (newObs - 1) + winLossPts) / newObs;
    const worstWinLossPts = Math.max(existingMove?.worstWinLossPts ?? 0, winLossPts);

    let role = existingMove?.role ?? 'candidate';
    let gateReason = existingMove?.gateReason ?? null;

    // ── Promotion check ──────────────────────────────────────────────────────
    if (role === 'candidate' && newObs >= REP_CONFIRM_OBS) {
      const isForcedMate = eval_.win_after !== null &&
                           eval_.win_after < 5 &&
                           eval_.classification === 'blunder';
      const gateResult = runGates({
        winLossPts,
        winAfter: eval_.win_after ?? 50,
        bestMoveWinAfter: eval_.win_before ?? 50,
        lineLoss: newLineLoss,
        isForcedMate,
      });

      // isFirstMoveAtNode: check working map for any canonical at this node
      const isFirstMoveAtNode = !([...moveMap.entries()]
        .some(([k, m]) => k.startsWith(`${epd}:${side}:`) && m.role === 'canonical'));

      const newRole = promoteCandidate(gateResult, isFirstMoveAtNode);
      role = newRole;
      gateReason = gateResult.reason;

      changelogEntries.push({
        at: nowMs,
        epd,
        side,
        kind: newRole === 'refused' ? 'refuse' : 'confirm',
        fromUci: null,
        toUci: move.uci,
        challengeId: null,
        rule: null,
        detailJson: JSON.stringify({ observations: newObs, gateResult }),
        provenanceId,
        bookVersion,
      });
    }

    moveMap.set(moveKey, {
      epd,
      side,
      moveUci: move.uci,
      moveSan: move.san,
      role,
      observations: newObs,
      weightedScore: existingMove?.weightedScore ?? null,
      meanWinLossPts,
      worstWinLossPts,
      auditId: existingMove?.auditId ?? null,
      gateReason,
      scoreW,
      scoreD,
      scoreL,
      firstPlayed: existingMove?.firstPlayed ?? nowMs,
      lastPlayed: nowMs,
    });
  }

  return {
    observations,
    nodeUpserts: [...nodeMap.values()],
    moveUpserts: [...moveMap.values()],
    changelogEntries,
  };
}
