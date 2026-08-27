/**
 * @module domain/analysis/pipeline
 * Three-pass analysis pipeline. Runs entirely against EngineClient port —
 * no persistence, no HTTP concerns here.
 */

import { Chess } from 'chess.js';

import { logger } from '../../config.js';
import { FINDABILITY_MIN, NEAR_MISS_WIN_PTS } from '../../shared/balance.js';
import { getTracer } from '../../telemetry.js';

import { classify, winPct, moveAccuracy, gameAccuracy } from './grade.js';
import { probeFindability } from './findability.js';

const log = logger.child({ mod: 'analysis-pipeline' });

// NFR budget weights for overallPct: pass1=76%, pass2=22%, pass3=2%
const PASS_WEIGHTS = [0.76, 0.22, 0.02];

/**
 * @param {object} opts
 * @param {string[]} opts.plies — ordered list of UCI moves from game start
 * @param {string} opts.playerColor — 'white' | 'black'
 * @param {import('../../ports/engine-client.js').EngineClient} opts.sfClient
 * @param {import('../../ports/engine-client.js').EngineClient} opts.maiaClient
 * @param {string} opts.maiaModel
 * @param {number} opts.playerElo
 * @param {boolean} opts.wasTimed
 * @param {object[]} [opts.existingEvals] — move_evals rows already in the DB; pass-1 skips those positions
 * @param {(event: object) => void} [opts.onProgress]
 * @returns {Promise<{moveEvals: object[], accuracy: number, opponentAccuracy: number, puzzleCandidates: object[]}>}
 */
export async function runAnalysis({
  plies, playerColor, sfClient, maiaClient, maiaModel, playerElo: _playerElo, wasTimed: _wasTimed,
  existingEvals = [],
  onProgress = () => {},
}) {
  const chess = new Chess();
  const positions = [];

  // Build position list: startpos + each position after every ply
  positions.push({ fen: chess.fen(), ply: 0, moveSan: null });
  for (const uci of plies) {
    const moveResult = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    positions.push({ fen: chess.fen(), ply: positions.length, moveSan: moveResult?.san ?? null });
  }

  const total = positions.length;
  const pass1Results = [];

  // Build a map from position index → stored eval so pass-1 can skip engine calls (FR-ANALYSE-11).
  // move_evals row at ply=P stores the eval of positions[P-1], so idx = ply - 1.
  const storedEvalByIdx = new Map();
  for (const e of existingEvals) {
    const idx = (e.ply ?? 0) - 1;
    if (idx >= 0) {
      storedEvalByIdx.set(idx, {
        cp: e.cp_white ?? e.cpWhite ?? null,
        mate: e.mate_in ?? e.mateIn ?? null,
        bestmove: e.best_move_uci ?? e.bestMoveUci ?? null,
        pv: e.pv ?? null,
      });
    }
  }

  // ── Pass 1: full game, every position ────────────────────────────────────
  const tracer = getTracer();
  const pass1Span = tracer?.startSpan('engine_pass_1', { attributes: { 'analysis.ply_count': total } });
  log.debug({ total }, 'analysis pass 1 starting');
  try {
    for (let i = 0; i < positions.length; i++) {
      const { fen } = positions[i];
      const stored = storedEvalByIdx.get(i);
      const evalResult = stored?.bestmove ? stored : await sfClient.eval(fen, { depth: 18 });
      pass1Results.push({ ...positions[i], ...evalResult });

      const pct = Math.round(((i + 1) / total) * 100 * PASS_WEIGHTS[0]);
      onProgress({ phase: 'pass1', done: i + 1, total, overallPct: pct });
    }
    pass1Span?.setStatus({ code: 1 });
  } catch (err) {
    pass1Span?.recordException(err);
    pass1Span?.setStatus({ code: 2, message: err.message });
    throw err;
  } finally {
    pass1Span?.end();
  }

  // ── Compute move evaluations ──────────────────────────────────────────────
  // Each move's "before" = pass1Results[i], "after" = pass1Results[i+1]
  const moveEvals = [];
  const playerAccuracies = [];
  const opponentAccuracies = [];

  for (let i = 0; i < plies.length; i++) {
    const before = pass1Results[i];
    const after = pass1Results[i + 1];
    const ply = i + 1;

    // Determine mover: ply 1 = white, ply 2 = black, etc.
    const moverColor = ply % 2 === 1 ? 'white' : 'black';
    const mover = moverColor === playerColor ? 'player' : 'opponent';

    // Synthetic +0.15 prior for White's first move (FR-GRADE-4): the starting position
    // is not equal — White has a small statistical advantage, so use 15cp instead of 0.
    const cpBeforeWhite = (i === 0) ? 15 : (before.cp ?? 0);
    const cpAfterWhite  = after.cp ?? 0;

    const winBeforeWhite = winPct(cpBeforeWhite);
    const winAfterWhite  = winPct(cpAfterWhite);

    // Convert to mover's POV: white mover wants high white win%, black mover wants low
    const winBefore = moverColor === 'white' ? winBeforeWhite : (100 - winBeforeWhite);
    const winAfter  = moverColor === 'white' ? winAfterWhite  : (100 - winAfterWhite);

    const winLoss = Math.max(0, winBefore - winAfter);
    // cp loss from mover's POV: white's cp drop for white mover, gain for black mover
    const cpLoss = moverColor === 'white'
      ? Math.max(0, cpBeforeWhite - cpAfterWhite)
      : Math.max(0, cpAfterWhite - cpBeforeWhite);
    // Detect mate scenarios for accurate classification
    const hadForcedMate = moverColor === 'white'
      ? (before.mate != null && before.mate > 0)
      : (before.mate != null && before.mate < 0);
    const afterHasForcedMateForMover = moverColor === 'white'
      ? (after.mate != null && after.mate > 0)
      : (after.mate != null && after.mate < 0);
    const walkedIntoMate = moverColor === 'white'
      ? (after.mate != null && after.mate < 0)
      : (after.mate != null && after.mate > 0);
    const mateMissed = hadForcedMate && !afterHasForcedMateForMover;
    const { classification } = classify(winLoss, cpLoss, {
      wasMate: walkedIntoMate,
      mateMissed,
      cpBefore: cpBeforeWhite,
    });
    const accuracy = moveAccuracy(winBefore, winAfter);

    if (mover === 'player') playerAccuracies.push(accuracy);
    else opponentAccuracies.push(accuracy);

    moveEvals.push({
      gameId: null, // filled in by caller
      ply,
      fen: before.fen,
      moveUci: plies[i],
      moveSan: after.moveSan ?? null,
      cpWhite: before.cp,
      mateIn: before.mate,
      bestMoveUci: before.bestmove,
      pv: before.pv,
      mover,
      winBefore,
      winAfter,
      cpLoss,
      winLoss,
      classification,
      moveAccuracy: accuracy,
      altMovesJson: null, // pass 2 populates this
    });
  }

  // ── Pass 2: candidate mistakes ────────────────────────────────────────────
  const candidates = moveEvals.filter(e =>
    e.mover === 'player' && (e.classification === 'blunder' || e.classification === 'mistake' || e.classification === 'inaccuracy')
  );

  const pass2Span = tracer?.startSpan('engine_pass_2', { attributes: { 'analysis.candidates': candidates.length } });
  log.debug({ candidates: candidates.length }, 'analysis pass 2 starting');
  try {
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const deepEval = await sfClient.eval(c.fen, { depth: 22, multiPV: 3 });
      const altMoves = (deepEval.lines ?? [])
        .filter(l => l.pv && l.pv.split(' ')[0] !== c.bestMoveUci)
        .map(l => ({ uci: l.pv.split(' ')[0], pv: l.pv, cp: l.cp }))
        .filter(a => {
          if (a.cp === null || c.winBefore === undefined) return true;
          const altWin = winPct(a.cp);
          return Math.abs(altWin - winPct(deepEval.cp ?? 0)) <= NEAR_MISS_WIN_PTS;
        });
      c.altMovesJson = JSON.stringify(altMoves);

      const pass2Pct = Math.round(PASS_WEIGHTS[0] * 100 + ((i + 1) / candidates.length) * 100 * PASS_WEIGHTS[1]);
      onProgress({ phase: 'pass2', done: i + 1, total: candidates.length, overallPct: pass2Pct });
    }
    pass2Span?.setStatus({ code: 1 });
  } catch (err) {
    pass2Span?.recordException(err);
    pass2Span?.setStatus({ code: 2, message: err.message });
    throw err;
  } finally {
    pass2Span?.end();
  }

  // ── Pass 3: Maia findability ──────────────────────────────────────────────
  const puzzleCandidates = [];

  const pass3Span = tracer?.startSpan('maia_findability', { attributes: { 'analysis.candidates': candidates.length } });
  log.debug({ candidates: candidates.length }, 'analysis pass 3 starting');
  try {
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const { findability, temptation, instructiveness, degraded } = await probeFindability({
        maiaClient,
        fen: c.fen,
        bestMoveUci: c.bestMoveUci,
        playedMoveUci: c.moveUci,
        winLossPts: c.winLoss,
        maiaModel,
      });

      const tags = [];
      if (temptation > 0.3) tags.push('common_trap');
      if (findability < FINDABILITY_MIN) tags.push('engine_only');

      puzzleCandidates.push({
        ...c,
        findability,
        temptation,
        instructiveness,
        maiaModel,
        policyTemperature: 1.0,
        tags: tags.join(','),
        engineOnly: findability < FINDABILITY_MIN,
        degraded,
      });

      const pass3Pct = Math.round((PASS_WEIGHTS[0] + PASS_WEIGHTS[1]) * 100 + ((i + 1) / candidates.length) * 100 * PASS_WEIGHTS[2]);
      onProgress({ phase: 'maia', done: i + 1, total: candidates.length, overallPct: Math.min(99, pass3Pct) });
    }
    pass3Span?.setStatus({ code: 1 });
  } catch (err) {
    pass3Span?.recordException(err);
    pass3Span?.setStatus({ code: 2, message: err.message });
    throw err;
  } finally {
    pass3Span?.end();
  }

  const selectSpan = tracer?.startSpan('select_puzzles');
  onProgress({ phase: 'select', done: 1, total: 1, overallPct: 100 });

  const accuracy = gameAccuracy(playerAccuracies);
  const opponentAcc = gameAccuracy(opponentAccuracies);

  selectSpan?.setStatus({ code: 1 });
  selectSpan?.end();

  return {
    moveEvals,
    accuracy,
    opponentAccuracy: opponentAcc,
    puzzleCandidates,
  };
}
