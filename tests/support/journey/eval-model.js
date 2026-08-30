/**
 * @module tests/support/journey/eval-model
 * Programmatic eval model for the journey harness.
 *
 * Derives CP bands from balance.js at load time and validates each band's
 * gate verdict at module initialisation. A threshold change breaks the band
 * assertion loudly rather than silently reclassifying half the journey.
 *
 * Usage:
 *   import { BANDS, makeEval, cpToWinLoss } from './eval-model.js';
 *   const eval_ = makeEval({ ply: 3, fen: '...', band: BANDS.EXCELLENT });
 */

import {
  BLUNDER_WIN_PTS,
  MISTAKE_WIN_PTS,
  INACCURACY_WIN_PTS,
} from '../../../src/shared/balance.js';

// ─── win% conversion ─────────────────────────────────────────────────────────

/**
 * Convert centipawns to win% (0–100) using the standard sigmoid.
 * This is the same formula analysis/pipeline.js uses.
 * @param {number} cp
 * @returns {number} win% for the side to move, 0–100
 */
export function cpToWinPct(cp) {
  return 100 / (1 + Math.exp(-0.004 * cp));
}

/**
 * Compute win_loss_pts from two consecutive positions.
 * Positive = win% gained (good move), negative = win% lost (bad move).
 * @param {number} cpBefore — cp for the side to move BEFORE the move
 * @param {number} cpAfter  — cp for the opponent BEFORE their response
 * @returns {number} win_loss_pts (the value stored in move_evals.win_loss_pts)
 */
export function winLossFromCp(cpBefore, cpAfter) {
  // win% from the player's perspective: before = their turn, after = opponent's turn
  // A "win" is gaining win% relative to the position before
  const before = cpToWinPct(cpBefore);
  const after = 100 - cpToWinPct(cpAfter); // flip because it's opponent's cp
  return after - before; // positive = gained, negative = lost
}

// ─── CP bands ────────────────────────────────────────────────────────────────

/**
 * Band definitions, each carrying:
 *  cp          — representative centipawn loss for this band
 *  winLossPts  — representative win_loss_pts value (negative = loss)
 *  classification — the move-quality label the pipeline assigns
 *  gateVerdict — 'admitted' | 'quarantined' | 'blocked'
 *
 * Verified at load time: gateVerdict is derived from the thresholds in balance.js.
 */
export const BANDS = {
  /** Best move or near-best: cp loss < GREAT_CP_MAX, win_loss < INACCURACY_WIN_PTS */
  EXCELLENT: {
    cp: 5,
    winLossPts: -(INACCURACY_WIN_PTS * 0.3),   // well inside admitted band
    classification: 'excellent',
    gateVerdict: 'admitted',
  },
  /** Good move: cp loss < GOOD_CP_MAX, win_loss < INACCURACY_WIN_PTS */
  GOOD: {
    cp: 35,
    winLossPts: -(INACCURACY_WIN_PTS * 0.7),   // still inside admitted
    classification: 'good',
    gateVerdict: 'admitted',
  },
  /** Inaccuracy: win_loss in [INACCURACY_WIN_PTS, MISTAKE_WIN_PTS) → admitted at boundary */
  INACCURACY: {
    cp: 80,
    winLossPts: -(INACCURACY_WIN_PTS + 2),    // admitted because < quarantine threshold
    classification: 'inaccuracy',
    gateVerdict: 'admitted',
  },
  /** Mistake: win_loss in [MISTAKE_WIN_PTS, BLUNDER_WIN_PTS) → quarantined */
  MISTAKE: {
    cp: 200,
    winLossPts: -(MISTAKE_WIN_PTS + 3),       // quarantined because >= quarantine threshold
    classification: 'mistake',
    gateVerdict: 'quarantined',
  },
  /** Blunder: win_loss >= BLUNDER_WIN_PTS → blocked */
  BLUNDER: {
    cp: 500,
    winLossPts: -(BLUNDER_WIN_PTS + 5),       // blocked because >= blunder threshold
    classification: 'blunder',
    gateVerdict: 'blocked',
  },
};

// ─── Band validation ─────────────────────────────────────────────────────────

function _expectedVerdict(winLossPts) {
  const loss = Math.abs(winLossPts);
  if (loss >= BLUNDER_WIN_PTS) return 'blocked';
  if (loss >= MISTAKE_WIN_PTS) return 'quarantined';
  return 'admitted';
}

for (const [name, band] of Object.entries(BANDS)) {
  const computed = _expectedVerdict(band.winLossPts);
  if (computed !== band.gateVerdict) {
    throw new Error(
      `BANDS.${name}: declared gateVerdict="${band.gateVerdict}" but ` +
      `winLossPts=${band.winLossPts} should produce "${computed}". ` +
      `A balance constant changed — update eval-model.js.`
    );
  }
}

// ─── Eval row factory ────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars -- zeroed by resetEvalSeq() to isolate independent test runs
let _evalSeq = 1;

/**
 * Create a move_eval row suitable for saveMoveEval.
 *
 * @param {object} opts
 * @param {string} opts.gameId
 * @param {number} opts.ply — 1-indexed ply
 * @param {string} opts.fen — FEN before the move
 * @param {string} opts.moveUci — UCI move string
 * @param {string} opts.moveSan — SAN move string
 * @param {'player'|'engine'} [opts.mover='player']
 * @param {object} [opts.band] — one of BANDS; defaults to EXCELLENT
 * @returns {object} row matching the snake_case schema expected by saveMoveEval
 */
export function makeEval({
  gameId,
  ply,
  fen,
  moveUci,
  moveSan,
  mover = 'player',
  band = BANDS.EXCELLENT,
}) {
  // SqliteGameRepository.saveMoveEval reads camelCase fields.
  // InMemoryGameRepository._normaliseMoveEval maps both shapes, so this works for both.
  return {
    gameId,
    ply,
    fen,
    moveUci,
    moveSan,
    cpWhite:       ply % 2 === 1 ? -band.cp : band.cp,  // cp from white's perspective
    mateIn:        null,
    bestMoveUci:   moveUci,   // assume player played best move for EXCELLENT
    pv:            moveUci,
    mover,
    winBefore:     50 + (mover === 'player' ? 0 : -band.winLossPts / 2),
    winAfter:      50 + (mover === 'player' ? band.winLossPts / 2 : 0),
    cpLoss:        band.cp,
    winLoss:       band.winLossPts,   // pipeline field — SqliteGameRepository maps to win_loss_pts
    classification: band.classification,
    moveAccuracy:  band.gateVerdict === 'admitted' ? 90 : 50,
    altMovesJson:  null,
  };
}

/**
 * Build a full set of move evals for a scripted game.
 *
 * @param {object} opts
 * @param {string} opts.gameId
 * @param {Array<{uci: string, san: string, fen: string, mover: string}>} opts.moves
 * @param {object} [opts.playerBand] — quality band for player moves; default EXCELLENT
 * @param {object} [opts.engineBand] — quality band for engine moves; default EXCELLENT
 * @returns {object[]} eval rows
 */
export function makeGameEvals({ gameId, moves, playerBand = BANDS.EXCELLENT, engineBand = BANDS.EXCELLENT }) {
  return moves.map((m, i) => makeEval({
    gameId,
    ply: i + 1,
    fen: m.fen,
    moveUci: m.uci,
    moveSan: m.san,
    mover: m.mover ?? (i % 2 === 0 ? 'player' : 'engine'),
    band: (m.mover ?? (i % 2 === 0 ? 'player' : 'engine')) === 'player' ? playerBand : engineBand,
  }));
}

/** Reset the internal eval sequence counter (call between test runs). */
export function resetEvalSeq() { _evalSeq = 1; }
