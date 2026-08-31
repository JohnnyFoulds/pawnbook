/**
 * @module domain/analysis/motif-explainer
 * Generates slot-filled, position-specific explanations for motif tags.
 * Each explanation names the specific pieces and squares involved so players
 * see "your knight on d4 was pinned" rather than a generic static string.
 * Pure deterministic computation — no engine calls, no I/O.
 */
import { Chess } from 'chess.js';

const PIECE_NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

const _RAY_DIRS = {
  r: [[0, 1], [0, -1], [1, 0], [-1, 0]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  q: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};

/**
 * Generate a position-specific explanation for a motif tag.
 * @param {string} fen - FEN before the move
 * @param {string} playedMoveUci - UCI string of the move played
 * @param {'white'|'black'} sideToMove
 * @param {string} motifTag - tag from classifyMotif
 * @returns {string|null}
 */
export function explainMotif(fen, playedMoveUci, sideToMove, motifTag) {
  if (!fen || !playedMoveUci || !sideToMove || !motifTag) return null;
  try {
    const generators = {
      hanging_piece: _explainHangingPiece,
      fork: _explainFork,
      back_rank: _explainBackRank,
      missed_capture: _explainMissedCapture,
      overloaded_defender: _explainOverloadedDefender,
      pinned_piece: _explainPinnedPiece,
      skewer: _explainSkewer,
      discovered_attack: _explainDiscoveredAttack,
    };
    const gen = generators[motifTag];
    if (!gen) return null;
    return gen(fen, playedMoveUci, sideToMove) ?? null;
  } catch {
    return null;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function _colors(sideToMove) {
  const playerColor = sideToMove === 'white' ? 'w' : 'b';
  return { playerColor, oppColor: playerColor === 'w' ? 'b' : 'w' };
}

function _n(type) { return PIECE_NAME[type] ?? 'piece'; }

// ── per-motif generators ─────────────────────────────────────────────────────

function _explainHangingPiece(fen, uci, sideToMove) {
  const { playerColor, oppColor } = _colors(sideToMove);
  const chess = new Chess(fen);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== playerColor) continue;
      if (!chess.isAttacked(cell.square, oppColor)) continue;
      if (chess.attackers(cell.square, playerColor).length === 0) {
        return `Your ${_n(cell.type)} on ${cell.square} had no defenders after this move — it can be captured for free.`;
      }
    }
  }
  return null;
}

function _explainFork(fen, uci, sideToMove) {
  const { playerColor, oppColor } = _colors(sideToMove);
  const chess = new Chess(fen);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  for (const row of chess.board()) {
    for (const oppCell of row) {
      if (!oppCell || oppCell.color !== oppColor || oppCell.type === 'k') continue;
      const targets = [];
      for (const tRow of chess.board()) {
        for (const target of tRow) {
          if (!target || target.color !== playerColor) continue;
          if ((PIECE_VALUE[target.type] ?? 0) < 3) continue;
          if (chess.attackers(target.square, oppColor).includes(oppCell.square)) {
            targets.push(target);
          }
        }
      }
      if (targets.length >= 2) {
        const t1 = targets[0], t2 = targets[1];
        return `The opponent's ${_n(oppCell.type)} on ${oppCell.square} attacks your ${_n(t1.type)} on ${t1.square} and your ${_n(t2.type)} on ${t2.square} at once.`;
      }
    }
  }
  return null;
}

function _explainBackRank(fen, uci, sideToMove) {
  const { playerColor, oppColor } = _colors(sideToMove);
  const chess = new Chess(fen);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  let kingSq = null;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === playerColor && cell.type === 'k') { kingSq = cell.square; }
    }
  }
  if (!kingSq) return null;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.color === oppColor && (cell.type === 'r' || cell.type === 'q')) {
        return `Your king on ${kingSq} is on the back rank with no escape squares — the opponent's ${_n(cell.type)} can deliver a back-rank checkmate.`;
      }
    }
  }
  return null;
}

function _explainMissedCapture(fen, uci, sideToMove) {
  const { playerColor, oppColor } = _colors(sideToMove);
  const chess = new Chess(fen);
  const playedTo = uci.slice(2, 4);
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== oppColor) continue;
      if (cell.square === playedTo) continue;
      const attackers = chess.attackers(cell.square, playerColor);
      if (!attackers.length) continue;
      const defenders = chess.attackers(cell.square, oppColor);
      const captureValue = PIECE_VALUE[cell.type] ?? 0;
      const cheapestAttacker = attackers
        .map(sq => chess.get(sq)).filter(Boolean)
        .reduce((min, p) => Math.min(min, PIECE_VALUE[p.type] ?? 99), 99);
      if (defenders.length === 0 || cheapestAttacker < captureValue) {
        const attackerSq = attackers[0];
        const attackerPiece = chess.get(attackerSq);
        const attackerName = attackerPiece ? _n(attackerPiece.type) : 'piece';
        const prefix = defenders.length === 0 ? 'for free' : 'at a material gain';
        return `Your ${attackerName} on ${attackerSq} could have captured the opponent's ${_n(cell.type)} on ${cell.square} ${prefix}.`;
      }
    }
  }
  return null;
}

function _explainOverloadedDefender(fen, uci, sideToMove) {
  const { playerColor, oppColor } = _colors(sideToMove);
  const chess = new Chess(fen);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const soloGuardedBy = {}; // defenderSq -> [guardedSquares]
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== playerColor) continue;
      if (!chess.isAttacked(cell.square, oppColor)) continue;
      const defenders = chess.attackers(cell.square, playerColor);
      if (defenders.length === 1) {
        const def = defenders[0];
        if (!soloGuardedBy[def]) soloGuardedBy[def] = [];
        soloGuardedBy[def].push(cell);
      }
    }
  }
  for (const [defSq, guarded] of Object.entries(soloGuardedBy)) {
    if (guarded.length >= 2) {
      const defPiece = chess.get(defSq);
      const g1 = guarded[0], g2 = guarded[1];
      return `Your ${_n(defPiece?.type ?? 'r')} on ${defSq} is the only piece defending both your ${_n(g1.type)} on ${g1.square} and your ${_n(g2.type)} on ${g2.square} — the opponent can take one and your defender can only save the other.`;
    }
  }
  return null;
}

function _explainPinnedPiece(fen, uci, sideToMove) {
  const { playerColor, oppColor } = _colors(sideToMove);
  const chess = new Chess(fen);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const board = chess.board();
  for (const row of board) {
    for (const cell of row) {
      if (!cell || cell.color !== oppColor) continue;
      const dirs = _RAY_DIRS[cell.type];
      if (!dirs) continue;
      const fi = cell.square.charCodeAt(0) - 97;
      const ri = parseInt(cell.square[1], 10) - 1;
      for (const [df, dr] of dirs) {
        let f = fi + df, r = ri + dr, first = null;
        while (f >= 0 && f < 8 && r >= 0 && r < 8) {
          const sq = String.fromCharCode(97 + f) + (r + 1);
          const piece = chess.get(sq);
          if (piece) {
            if (piece.color === playerColor) {
              if (!first) { first = { piece, sq }; }
              else {
                if ((PIECE_VALUE[piece.type] ?? 0) > (PIECE_VALUE[first.piece.type] ?? 0)) {
                  return `Your ${_n(first.piece.type)} on ${first.sq} is pinned by the opponent's ${_n(cell.type)} on ${cell.square} — moving it would expose your ${_n(piece.type)} on ${sq} to capture.`;
                }
                break;
              }
            } else { break; }
          }
          f += df; r += dr;
        }
      }
    }
  }
  return null;
}

function _explainSkewer(fen, uci, sideToMove) {
  const { playerColor, oppColor } = _colors(sideToMove);
  const chess = new Chess(fen);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const board = chess.board();
  for (const row of board) {
    for (const cell of row) {
      if (!cell || cell.color !== oppColor) continue;
      const dirs = _RAY_DIRS[cell.type];
      if (!dirs) continue;
      const fi = cell.square.charCodeAt(0) - 97;
      const ri = parseInt(cell.square[1], 10) - 1;
      for (const [df, dr] of dirs) {
        let f = fi + df, r = ri + dr, first = null;
        while (f >= 0 && f < 8 && r >= 0 && r < 8) {
          const sq = String.fromCharCode(97 + f) + (r + 1);
          const piece = chess.get(sq);
          if (piece) {
            if (piece.color === playerColor) {
              if (!first) { first = { piece, sq }; }
              else {
                if ((PIECE_VALUE[first.piece.type] ?? 0) > (PIECE_VALUE[piece.type] ?? 0)) {
                  return `The opponent's ${_n(cell.type)} on ${cell.square} is targeting your ${_n(first.piece.type)} on ${first.sq} — when it moves to safety, your ${_n(piece.type)} on ${sq} will be captured.`;
                }
                break;
              }
            } else { break; }
          }
          f += df; r += dr;
        }
      }
    }
  }
  return null;
}

function _explainDiscoveredAttack(fen, uci, sideToMove) {
  const { playerColor, oppColor } = _colors(sideToMove);
  const preFen = fen;
  const preChess = new Chess(preFen);
  const preAttacked = new Set();
  for (const row of preChess.board()) {
    for (const cell of row) {
      if (cell && cell.color === playerColor && preChess.isAttacked(cell.square, oppColor)) {
        preAttacked.add(cell.square);
      }
    }
  }
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const chess = new Chess(fen);
  chess.move({ from, to, promotion: uci[4] });
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== playerColor) continue;
      if (cell.square === to) continue;
      if ((PIECE_VALUE[cell.type] ?? 0) < 3) continue;
      if (!chess.isAttacked(cell.square, oppColor)) continue;
      if (preAttacked.has(cell.square)) continue;
      // Find the attacker
      const attackers = chess.attackers(cell.square, oppColor);
      const attacker = attackers.length ? chess.get(attackers[0]) : null;
      const attackerName = attacker ? _n(attacker.type) : 'piece';
      const attackerSq = attackers[0] ?? '?';
      return `Moving your piece from ${from} uncovered the opponent's ${attackerName} on ${attackerSq} — it now threatens your ${_n(cell.type)} on ${cell.square}.`;
    }
  }
  return null;
}
