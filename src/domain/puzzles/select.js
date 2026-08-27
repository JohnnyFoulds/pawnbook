/**
 * @module domain/puzzles/select
 * Puzzle selection, deduplication, and phase classification.
 */

import { Chess } from 'chess.js';

import {
  FINDABILITY_MIN, PUZZLES_PER_GAME_MAX, NEAR_MISS_WIN_PTS,
  ENDGAME_MATERIAL_MAX, OPENING_PLY_MAX,
} from '../../shared/balance.js';

/** Point values for non-king, non-pawn material. */
const PIECE_VALUES = { q: 9, r: 5, b: 3, n: 3 };

/**
 * Derive the game phase from a FEN and ply number.
 * @param {{ fen: string, ply: number }} opts
 * @returns {'opening' | 'middlegame' | 'endgame'}
 */
export function derivePhase({ fen, ply }) {
  const chess = new Chess(fen);
  const board = chess.board();

  let material = 0;

  const castling = fen.split(' ')[2] ?? '-';
  const hasCastlingRights = castling !== '-';

  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      const val = PIECE_VALUES[sq.type];
      if (val) material += val;
    }
  }

  if (material <= ENDGAME_MATERIAL_MAX) return 'endgame';

  if (ply <= OPENING_PLY_MAX && hasCastlingRights) return 'opening';

  return 'middlegame';
}

/**
 * Select puzzle candidates from analysis results.
 * Filters by findability gate, caps per game, ranks by instructiveness.
 *
 * @param {object[]} puzzleCandidates — from runAnalysis(); each has findability, instructiveness, etc.
 * @param {object} opts
 * @param {boolean} [opts.wasTimed]
 * @param {number} [opts.playerElo]
 * @returns {object[]} selected puzzles, up to PUZZLES_PER_GAME_MAX
 */
export function selectPuzzles(puzzleCandidates, opts = {}) {
  const { wasTimed = false } = opts;

  return puzzleCandidates
    .filter(c => c.findability >= FINDABILITY_MIN)
    .sort((a, b) => (b.instructiveness ?? 0) - (a.instructiveness ?? 0))
    .slice(0, PUZZLES_PER_GAME_MAX)
    .map(c => ({
      ...c,
      wasTimed,
      phase: derivePhase({ fen: c.fen, ply: c.ply }),
    }));
}

/**
 * Build the accepted_moves_json field: best move + any alternative within NEAR_MISS_WIN_PTS.
 * @param {string} bestMoveUci
 * @param {object[]} altLines — from MultiPV pass (each has {uci, cp})
 * @param {number} bestCp
 * @returns {string} JSON array of accepted UCI moves
 */
export function buildAcceptedMoves(bestMoveUci, altLines, bestCp) {
  const { winPct } = _winPctLocal;
  const bestWin = winPct(bestCp ?? 0);
  const accepted = [bestMoveUci];

  for (const line of altLines ?? []) {
    if (!line.uci || line.uci === bestMoveUci) continue;
    const altWin = winPct(line.cp ?? 0);
    if (Math.abs(altWin - bestWin) <= NEAR_MISS_WIN_PTS) {
      accepted.push(line.uci);
    }
  }

  return JSON.stringify(accepted);
}

// Inline winPct to avoid circular dep with grade.js (which imports balance.js)
const WC_K = 0.00368208;
const CP_CLAMP = 1000;
const _winPctLocal = {
  winPct(cp) {
    const clamped = Math.max(-CP_CLAMP, Math.min(CP_CLAMP, isFinite(cp) ? cp : Math.sign(cp) * CP_CLAMP));
    return 50 + 50 * Math.max(-1, Math.min(1, 2 / (1 + Math.exp(-WC_K * clamped)) - 1));
  },
};
