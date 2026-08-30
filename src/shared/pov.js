/**
 * @module shared/pov
 * Normalise UCI engine output to White's point of view.
 *
 * UCI `score cp` is *always* relative to the side to move.
 * The EngineClient port contract requires White-POV (`cp_white`).
 * This module provides the single conversion function used by both
 * engine adapters and by scripts/regrade.js.
 */

/**
 * Negate `cp`, `mate`, and every `lines[]` entry when Black is to move.
 *
 * @param {string} fen - the position FEN (only the side-to-move field is read)
 * @param {{cp: number|null, mate: number|null, lines?: object[]}} result
 *   - the raw engine result with side-to-move-relative scores
 * @returns {{cp: number|null, mate: number|null, lines?: object[]}}
 *   - a *new* object with all scores in White's POV; `lines` entries are
 *     also shallow-copied with negated cp/mate fields
 */
export function normaliseToWhitePov(fen, result) {
  // FEN fields: position, side-to-move, castling, en-passant, halfmove, fullmove
  const sideToMove = fen.split(' ')[1]; // 'w' or 'b'
  if (sideToMove !== 'b') return result; // white to move → already White POV

  const negate = v => (v == null ? v : -v);
  const negateLines = (lines) =>
    lines?.map(l => ({ ...l, cp: negate(l.cp), mate: negate(l.mate) })) ?? lines;

  return {
    ...result,
    cp: negate(result.cp),
    mate: negate(result.mate),
    ...(result.lines !== undefined ? { lines: negateLines(result.lines) } : {}),
  };
}
