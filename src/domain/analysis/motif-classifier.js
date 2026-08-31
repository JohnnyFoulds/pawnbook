/**
 * @module domain/analysis/motif-classifier
 * Classifies a chess mistake into a named motif tag.
 * Pure deterministic computation over chess.js board state — no engine calls.
 */
import { Chess } from 'chess.js';

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

/**
 * Classify a mistake into a motif tag.
 * Examines the position AFTER the played move.
 *
 * @param {string} fen - FEN before the move
 * @param {string} playedMoveUci - UCI string of the move played (e.g. 'e2e4', 'e7e8q')
 * @param {'white'|'black'} sideToMove
 * @returns {'hanging_piece'|'fork'|null}
 */
export function classifyMotif(fen, playedMoveUci, sideToMove) {
  if (!fen || !playedMoveUci || !sideToMove) return null;
  try {
    const chess = new Chess(fen);
    const playerColor = sideToMove === 'white' ? 'w' : 'b';
    const oppColor = playerColor === 'w' ? 'b' : 'w';

    const moved = chess.move({
      from: playedMoveUci.slice(0, 2),
      to: playedMoveUci.slice(2, 4),
      promotion: playedMoveUci[4] || undefined,
    });
    if (!moved) return null;

    // hanging_piece: any player piece that is attacked and completely undefended
    for (const row of chess.board()) {
      for (const cell of row) {
        if (!cell || cell.color !== playerColor) continue;
        if (!chess.isAttacked(cell.square, oppColor)) continue;
        if (chess.attackers(cell.square, playerColor).length === 0) {
          return 'hanging_piece';
        }
      }
    }

    // fork: a single opponent piece (non-king) attacks 2+ valuable player pieces
    for (const row of chess.board()) {
      for (const oppCell of row) {
        if (!oppCell || oppCell.color !== oppColor) continue;
        if (oppCell.type === 'k') continue;
        let targets = 0;
        for (const targetRow of chess.board()) {
          for (const target of targetRow) {
            if (!target || target.color !== playerColor) continue;
            if ((PIECE_VALUE[target.type] ?? 0) < 3) continue;
            if (chess.attackers(target.square, oppColor).includes(oppCell.square)) targets++;
          }
        }
        if (targets >= 2) return 'fork';
      }
    }

    return null;
  } catch {
    return null;
  }
}
