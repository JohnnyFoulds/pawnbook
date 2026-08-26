/**
 * @module domain/puzzles/select
 * Puzzle selection, deduplication, and phase classification.
 */

import { Chess } from 'chess.js';

/** Point values for non-king, non-pawn material. */
const PIECE_VALUES = { q: 9, r: 5, b: 3, n: 3 };
const ENDGAME_MATERIAL_MAX = 13;
const OPENING_PLY_MAX = 20;

/**
 * Derive the game phase from a FEN and ply number.
 * @param {{ fen: string, ply: number }} opts
 * @returns {'opening' | 'middlegame' | 'endgame'}
 */
export function derivePhase({ fen, ply }) {
  const chess = new Chess(fen);
  const board = chess.board();

  let material = 0;
  let hasCastlingRights = false;

  const castling = fen.split(' ')[2] ?? '-';
  hasCastlingRights = castling !== '-';

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
