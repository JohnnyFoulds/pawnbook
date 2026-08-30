/**
 * @module api/ws/audit-service
 * Computes and persists engine evidence for open challenges (B6, B7).
 *
 * - Depth-22 MultiPV-3 audit of challenger and incumbent at the challenge FEN (B6).
 * - engineDeltaWinPts = winPct(challenger) − winPct(incumbent) (B7 headline fix).
 * - Gate verdict for the challenger (rule 1 / rule 5 inputs).
 * - Trend at +[2,4,6] plies from challenger/incumbent observations (B7).
 * - Elo-adjusted result performance from finished games (B7).
 *
 * Called from challenge-service.js before resolveChallenge().
 * Always swallows errors — must never affect a game or analysis run.
 */

import { randomUUID } from 'crypto';

import { Chess } from 'chess.js';

import { eloAdjustedPerf } from '../../domain/repertoire/challenge.js';
import { runGates } from '../../domain/repertoire/gates.js';
import { winPct as cpToWinPct } from '../../domain/analysis/grade.js';
import {
  REP_AUDIT_DEPTH,
  REP_AUDIT_MULTIPV,
  REP_CHALLENGE_TREND_PLIES,
} from '../../shared/balance.js';
import { logger } from '../../config.js';

const log = logger.child({ mod: 'audit-service' });

/**
 * Compute and persist engine evidence for a single open challenge.
 * Skips engine evaluation if engineDeltaWinPts is already set.
 *
 * @param {{
 *   challenge: object,
 *   enginePool: object|null,
 *   repertoireRepo: object,
 *   gameRepo: object|null,
 *   provenanceId: number,
 *   bookVersion: number,
 * }} opts
 */
export async function runChallengeAudit({
  challenge,
  enginePool,
  repertoireRepo,
  gameRepo,
  provenanceId,
  bookVersion,
}) {
  try {
    if (challenge.engineDeltaWinPts === null && enginePool != null) {
      await _computeEngineEvidence({ challenge, enginePool, repertoireRepo, provenanceId, bookVersion });
    }

    if (gameRepo != null) {
      _computeTrend({ challenge, repertoireRepo, gameRepo });
      _computeResults({ challenge, repertoireRepo, gameRepo });
    }
  } catch (err) {
    log.warn({ err, challengeId: challenge.id }, 'runChallengeAudit failed');
  }
}

// ─── Engine evidence ─────────────────────────────────────────────────────────

async function _computeEngineEvidence({ challenge, enginePool, repertoireRepo, provenanceId, bookVersion }) {
  const sfClient = await enginePool.getAnalysisSfClient();
  const fen = challenge.fen;
  const nowMs = Date.now();

  // Evaluate win% by evaluating the resulting position after each move.
  // Returns win% from the ORIGINAL MOVER'S perspective (0–100 scale).
  const chalWinPct = await _evalMoveWinPct(sfClient, fen, challenge.challengerUci, challenge.side);
  const incWinPct  = await _evalMoveWinPct(sfClient, fen, challenge.incumbentUci,  challenge.side);

  const engineDelta = chalWinPct !== null && incWinPct !== null
    ? chalWinPct - incWinPct
    : null;

  // Compute gate verdict for the challenger using the position's baseline eval.
  const { gateVerdict, gateReason } = await _computeGateVerdict(
    sfClient, fen, challenge.side, chalWinPct, repertoireRepo, challenge.epd
  );

  const chalAuditId = randomUUID();
  const incAuditId  = randomUUID();

  repertoireRepo.appendAudit({
    id: chalAuditId, epd: challenge.epd, side: challenge.side,
    moveUci: challenge.challengerUci,
    depth: REP_AUDIT_DEPTH, multipv: REP_AUDIT_MULTIPV,
    winPct: chalWinPct, cp: null, pv: null,
    runAt: nowMs, provenanceId, bookVersion,
  });
  repertoireRepo.appendAudit({
    id: incAuditId, epd: challenge.epd, side: challenge.side,
    moveUci: challenge.incumbentUci,
    depth: REP_AUDIT_DEPTH, multipv: REP_AUDIT_MULTIPV,
    winPct: incWinPct, cp: null, pv: null,
    runAt: nowMs, provenanceId, bookVersion,
  });

  repertoireRepo.updateChallenge(challenge.id, {
    engineDeltaWinPts: engineDelta,
    engineAuditId: chalAuditId,
    gateVerdict,
    gateReason,
  });

  // Propagate gate verdict to the challenger move's own record.
  const chalMove = repertoireRepo.getMove(challenge.epd, challenge.side, challenge.challengerUci);
  if (chalMove) {
    repertoireRepo.upsertMove({ ...chalMove, auditId: chalAuditId, gateReason });
  }

  log.info({ challengeId: challenge.id, engineDelta, gateVerdict }, 'engine evidence computed');
}

/**
 * Evaluate a move's win% by evaluating the resulting FEN.
 * Returns win% from the ORIGINAL MOVER'S perspective, or null on failure.
 * @param {object} sfClient
 * @param {string} fen — position where the move is made
 * @param {string} uci — move to evaluate
 * @param {'white'|'black'} side — original mover's side
 * @returns {Promise<number|null>}
 */
async function _evalMoveWinPct(sfClient, fen, uci, side) {
  try {
    const chess = new Chess(fen);
    const result = chess.move({
      from: uci.slice(0, 2), to: uci.slice(2, 4),
      promotion: uci[4] ?? undefined,
    });
    if (!result) return null;
    const resultingFen = chess.fen();
    const ev = await sfClient.eval(resultingFen, { depth: REP_AUDIT_DEPTH });
    const cp = ev.cp ?? (ev.mate != null ? (ev.mate > 0 ? 9999 : -9999) : null);
    if (cp === null) return null;
    // cp is from white's perspective; resulting FEN is opponent-to-move.
    // Mover's win% = white's win% when side='white', else opponent's (100 - white's).
    const whiteWinPct = cpToWinPct(cp);
    return side === 'white' ? whiteWinPct : (100 - whiteWinPct);
  } catch {
    return null;
  }
}

/**
 * Compute gate verdict for the challenger using the position-level eval as the
 * "best move" baseline.
 */
async function _computeGateVerdict(sfClient, fen, side, chalWinPct, repertoireRepo, epd) {
  if (chalWinPct === null) return { gateVerdict: null, gateReason: null };
  try {
    // The position eval approximates bestMoveWinAfter (value of the position = value after best play).
    const posEval = await sfClient.eval(fen, { depth: REP_AUDIT_DEPTH });
    const posCp = posEval.cp ?? (posEval.mate != null ? (posEval.mate > 0 ? 9999 : -9999) : 0);
    const whiteWinPctAtPos = cpToWinPct(posCp);
    // bestMoveWinAfter from mover's perspective
    const bestMoveWinAfter = side === 'white' ? whiteWinPctAtPos : (100 - whiteWinPctAtPos);
    const winLossPts = Math.max(0, bestMoveWinAfter - chalWinPct);
    const isForcedMate = posEval.mate !== null && posEval.mate < 0;

    // lineLoss from the node, if available
    const node = repertoireRepo.getNode(epd, side);
    const lineLoss = node?.lineLoss ?? null;

    const { verdict, reason } = runGates({
      winLossPts,
      winAfter: chalWinPct,
      bestMoveWinAfter,
      lineLoss,
      isForcedMate,
    });
    return { gateVerdict: verdict, gateReason: reason };
  } catch {
    return { gateVerdict: null, gateReason: null };
  }
}

// ─── Trend evidence ──────────────────────────────────────────────────────────

function _computeTrend({ challenge, repertoireRepo, gameRepo }) {
  try {
    const observations = repertoireRepo.getObservationsForNode(challenge.epd, challenge.side);
    const chalObs = observations.filter(
      o => o.moveUci === challenge.challengerUci && o.source !== 'coach_corrected'
    );
    const incObs = observations.filter(
      o => o.moveUci === challenge.incumbentUci && o.source !== 'coach_corrected'
    );

    const chalTrend = _meanTrendAtPlies(chalObs, gameRepo);
    const incTrend  = _meanTrendAtPlies(incObs, gameRepo);

    if (chalTrend !== null || incTrend !== null) {
      repertoireRepo.updateChallenge(challenge.id, {
        trendChallenger: chalTrend,
        trendIncumbent: incTrend,
      });
    }
  } catch (err) {
    log.warn({ err, challengeId: challenge.id }, 'trend computation failed');
  }
}

/**
 * Compute mean win% at trend plies (+2, +4, +6 from the observation ply).
 * @param {object[]} observations
 * @param {object} gameRepo
 * @returns {number|null}
 */
function _meanTrendAtPlies(observations, gameRepo) {
  if (!observations.length) return null;
  const samples = [];
  for (const obs of observations) {
    try {
      const evals = gameRepo.getEvals(obs.gameId);
      for (const offset of REP_CHALLENGE_TREND_PLIES) {
        const targetPly = obs.ply + offset;
        const ev = evals.find(e => e.ply === targetPly);
        if (ev?.win_after != null) samples.push(ev.win_after);
      }
    } catch {
      // game may not have evals yet
    }
  }
  return samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
}

// ─── Result performance ──────────────────────────────────────────────────────

function _computeResults({ challenge, repertoireRepo, gameRepo }) {
  try {
    const observations = repertoireRepo.getObservationsForNode(challenge.epd, challenge.side);
    const chalGameIds = [...new Set(
      observations
        .filter(o => o.moveUci === challenge.challengerUci && o.source !== 'coach_corrected')
        .map(o => o.gameId)
    )];
    const incGameIds = [...new Set(
      observations
        .filter(o => o.moveUci === challenge.incumbentUci && o.source !== 'coach_corrected')
        .map(o => o.gameId)
    )];

    const chalPerf = _meanEloAdjPerf(chalGameIds, gameRepo);
    const incPerf  = _meanEloAdjPerf(incGameIds, gameRepo);

    if (chalPerf !== null || incPerf !== null) {
      repertoireRepo.updateChallenge(challenge.id, {
        resultChallengerPerf: chalPerf?.mean ?? null,
        resultChallengerN:    chalPerf?.n ?? 0,
        resultIncumbentPerf:  incPerf?.mean ?? null,
        resultIncumbentN:     incPerf?.n ?? 0,
      });
    }
  } catch (err) {
    log.warn({ err, challengeId: challenge.id }, 'result computation failed');
  }
}

/**
 * @param {string[]} gameIds
 * @param {object} gameRepo
 * @returns {{ mean: number, n: number }|null}
 */
function _meanEloAdjPerf(gameIds, gameRepo) {
  if (!gameIds.length) return null;
  const perfs = [];
  for (const id of gameIds) {
    try {
      const game = gameRepo.findById(id);
      if (game.status !== 'finished' || game.result == null) continue;
      const score = game.result === 'win' ? 1 : game.result === 'draw' ? 0.5 : 0;
      const opponentElo = game.opponentElo ?? 1200;
      const playerElo   = game.eloBefore ?? 1200;
      perfs.push(eloAdjustedPerf(score, opponentElo, playerElo));
    } catch {
      // game may not exist in gameRepo
    }
  }
  return perfs.length
    ? { mean: perfs.reduce((a, b) => a + b, 0) / perfs.length, n: perfs.length }
    : null;
}
