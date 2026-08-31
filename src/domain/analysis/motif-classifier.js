/**
 * @module domain/analysis/motif-classifier
 * Classifies a chess mistake into a named motif tag.
 * Pure deterministic computation over chess.js board state — no engine calls.
 */
import { Chess } from 'chess.js';

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

/**
 * Classify a mistake into a motif tag.
 * Priority order: hanging_piece → fork → back_rank → missed_capture.
 *
 * @param {string} fen - FEN before the move
 * @param {string} playedMoveUci - UCI string of the move played (e.g. 'e2e4', 'e7e8q')
 * @param {'white'|'black'} sideToMove
 * @returns {'hanging_piece'|'fork'|'back_rank'|'missed_capture'|null}
 */
export function classifyMotif(fen, playedMoveUci, sideToMove) {
  if (!fen || !playedMoveUci || !sideToMove) return null;
  try {
    const chess = new Chess(fen);
    const playerColor = sideToMove === 'white' ? 'w' : 'b';
    const oppColor = playerColor === 'w' ? 'b' : 'w';
    const to = playedMoveUci.slice(2, 4);

    // PRE-MOVE: check for missed_capture (evaluated before the move is applied)
    const missedCapture = _hasMissedCapture(chess, playerColor, oppColor, to);

    const moved = chess.move({
      from: playedMoveUci.slice(0, 2),
      to,
      promotion: playedMoveUci[4] || undefined,
    });
    if (!moved) return null;

    // POST-MOVE: hanging_piece — any player piece attacked and completely undefended
    for (const row of chess.board()) {
      for (const cell of row) {
        if (!cell || cell.color !== playerColor) continue;
        if (!chess.isAttacked(cell.square, oppColor)) continue;
        if (chess.attackers(cell.square, playerColor).length === 0) {
          return 'hanging_piece';
        }
      }
    }

    // POST-MOVE: fork — single opponent piece (non-king) attacks 2+ valuable player pieces
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

    // POST-MOVE: back_rank — king on back rank with no pawn cover and opponent has major piece
    if (_hasBackRank(chess, playerColor, oppColor)) return 'back_rank';

    // PRE-MOVE result: missed_capture — a winning capture was available but not taken
    if (missedCapture) return 'missed_capture';

    return null;
  } catch {
    return null;
  }
}

/**
 * Returns true when a winning capture existed pre-move that the player didn't take.
 * A capture is winning when the target is undefended OR the cheapest attacker < target value.
 */
function _hasMissedCapture(chess, playerColor, oppColor, playedTo) {
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== oppColor) continue;
      if (cell.square === playedTo) continue; // player captured this one — not missed
      const attackers = chess.attackers(cell.square, playerColor);
      if (!attackers.length) continue;
      const defenders = chess.attackers(cell.square, oppColor);
      const captureValue = PIECE_VALUE[cell.type] ?? 0;
      const cheapestAttacker = attackers
        .map(sq => chess.get(sq))
        .filter(Boolean)
        .reduce((min, p) => Math.min(min, PIECE_VALUE[p.type] ?? 99), 99);
      if (defenders.length === 0 || cheapestAttacker < captureValue) return true;
    }
  }
  return false;
}

/**
 * Returns true when the player's king is on the back rank with no pawn luft
 * and the opponent has at least one rook or queen.
 */
function _hasBackRank(chess, playerColor, oppColor) {
  let kingSquare = null;
  outer: for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === playerColor && cell.type === 'k') {
        kingSquare = cell.square;
        break outer;
      }
    }
  }
  if (!kingSquare) return false;

  const kingRank = parseInt(kingSquare[1], 10);
  if (kingRank !== (playerColor === 'w' ? 1 : 8)) return false;

  // Luft: any player pawn on the 3 squares directly in front of the king
  const luftRank = playerColor === 'w' ? 2 : 7;
  const kingFile = kingSquare.charCodeAt(0);
  for (let f = kingFile - 1; f <= kingFile + 1; f++) {
    if (f < 97 || f > 104) continue;
    const piece = chess.get(String.fromCharCode(f) + luftRank);
    if (piece && piece.color === playerColor && piece.type === 'p') return false;
  }

  // Opponent must have at least one rook or queen
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === oppColor && (cell.type === 'r' || cell.type === 'q')) {
        return true;
      }
    }
  }
  return false;
}
