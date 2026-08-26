/**
 * @module domain/analysis/pipeline
 * Three-pass analysis pipeline. Runs entirely against EngineClient port —
 * no persistence, no HTTP concerns here.
 */

import { Chess } from 'chess.js';
import { logger } from '../../config.js';
import { classify, winPct, moveAccuracy, gameAccuracy } from './grade.js';
import { probeFindability } from './findability.js';
import { FINDABILITY_MIN, NEAR_MISS_WIN_PTS } from '../../shared/balance.js';

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
 * @param {(event: object) => void} [opts.onProgress]
 * @returns {Promise<{moveEvals: object[], accuracy: number, opponentAccuracy: number, puzzleCandidates: object[]}>}
 */
export async function runAnalysis({
  plies, playerColor, sfClient, maiaClient, maiaModel, playerElo, wasTimed,
  onProgress = () => {},
}) {
  const chess = new Chess();
  const positions = [];

  // Build position list: startpos + each position after every ply
  positions.push({ fen: chess.fen(), ply: 0 });
  for (const uci of plies) {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    positions.push({ fen: chess.fen(), ply: positions.length });
  }

  const total = positions.length;
  const pass1Results = [];

  // ── Pass 1: full game, every position ────────────────────────────────────
  log.debug({ total }, 'analysis pass 1 starting');
  for (let i = 0; i < positions.length; i++) {
    const { fen } = positions[i];
    const evalResult = await sfClient.eval(fen, { depth: 18 });
    pass1Results.push({ ...positions[i], ...evalResult });

    const pct = Math.round(((i + 1) / total) * 100 * PASS_WEIGHTS[0]);
    onProgress({ phase: 'pass1', done: i + 1, total, overallPct: pct });
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

    const cpBeforeWhite = before.cp ?? 0;
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
    const { classification } = classify(winLoss, cpLoss);
    const accuracy = moveAccuracy(winBefore, winAfter);

    if (mover === 'player') playerAccuracies.push(accuracy);
    else opponentAccuracies.push(accuracy);

    moveEvals.push({
      gameId: null, // filled in by caller
      ply,
      fen: before.fen,
      moveUci: plies[i],
      moveSan: null, // filled if needed
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

  log.debug({ candidates: candidates.length }, 'analysis pass 2 starting');
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const deepEval = await sfClient.eval(c.fen, { depth: 20, multiPV: 3 });
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

  // ── Pass 3: Maia findability ──────────────────────────────────────────────
  const puzzleCandidates = [];

  log.debug({ candidates: candidates.length }, 'analysis pass 3 starting');
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

  onProgress({ phase: 'select', done: 1, total: 1, overallPct: 100 });

  const accuracy = gameAccuracy(playerAccuracies);
  const opponentAcc = gameAccuracy(opponentAccuracies);

  return {
    moveEvals,
    accuracy,
    opponentAccuracy: opponentAcc,
    puzzleCandidates,
  };
}
