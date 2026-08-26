/**
 * @module tui/board
 * 4×2-cell board renderer for the TUI.
 *
 * Each square is 4 columns × 2 rows:
 *   row 0: ░ PIECE ░   (piece glyph or space)
 *   row 1: ░ DOT  ░   (affordance row: legal-move dot, check marker, blank)
 *
 * Dark squares use U+2591 (░) as the Fritz hatch — colour and texture are
 * orthogonal channels, so the board survives --plain, --ascii, and piped output.
 *
 * Piece glyphs: only the filled set U+265A–265F with VS15 (U+FE0E) appended,
 * reserving 2 columns regardless of the terminal's reported glyph width.
 *
 * @typedef {{ file: number, rank: number }} Square  file/rank in 0-based [0,7]
 */

import { buildPalette, RESET } from './theme.js';

/** VS15 — text presentation selector, forces monochrome rendering */
const VS15 = '︎';

/**
 * The filled chess glyph set (U+265A–265F).
 * Used for BOTH colours; White vs Black distinguished by foreground colour.
 * @type {Record<string, string>}
 */
const GLYPHS = {
  k: `♚${VS15}`,  // king
  q: `♛${VS15}`,  // queen
  r: `♜${VS15}`,  // rook
  b: `♝${VS15}`,  // bishop
  n: `♞${VS15}`,  // knight
  p: `♟${VS15}`,  // pawn
};

/** ASCII fallback: White uppercase, Black lowercase — same as piece letter. */
const ASCII = {
  K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N', P: 'P',
  k: 'k', q: 'q', r: 'r', b: 'b', n: 'n', p: 'p',
};

// ── Board state types ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} BoardState
 * @property {string}   fen            — current position
 * @property {number[]} legalDots      — squares with a legal-move dot (0-indexed, 0=a8)
 * @property {number|null} selected    — selected square index
 * @property {number|null} lastFrom    — last-move origin square index
 * @property {number|null} lastTo      — last-move destination square index
 * @property {number|null} checkSq     — king-in-check square index
 * @property {number|null} cursor      — cursor square index
 * @property {boolean}  flipped        — true when board is shown from Black's perspective
 */

/**
 * @typedef {Object} RenderOpts
 * @property {boolean}  [ascii]        — use ASCII letters, no glyphs
 * @property {boolean}  [hatch]        — default true; false disables ░
 * @property {boolean}  [plain]        — force 16-colour palette
 * @property {string}   [colorDepth]   — override COLORTERM detection
 * @property {number}   [originCol]    — render offset col (for mouse hit-test)
 * @property {number}   [originRow]    — render offset row
 */

// ── Coordinate helpers ────────────────────────────────────────────────────────

/**
 * Convert a FEN piece field to a 64-element array (index 0 = a8).
 * @param {string} fen
 * @returns {Array<string|null>}
 */
export function fenToPieces(fen) {
  const rank8 = fen.split(' ')[0];
  const pieces = new Array(64).fill(null);
  let idx = 0;
  for (const ch of rank8) {
    if (ch === '/') continue;
    const n = parseInt(ch, 10);
    if (!isNaN(n)) { idx += n; }
    else { pieces[idx++] = ch; }
  }
  return pieces;
}

/**
 * Convert a square string ('e4') to a 0-based index (0 = a8).
 * @param {string} sq
 * @returns {number}
 */
export function sqToIndex(sq) {
  const file = sq.charCodeAt(0) - 97; // 'a' = 0
  const rank = parseInt(sq[1]) - 1;    // '1' = 0
  return (7 - rank) * 8 + file;
}

/**
 * Convert a 0-based square index to a square string ('e4').
 * @param {number} idx
 * @returns {string}
 */
export function indexToSq(idx) {
  const file = idx % 8;
  const rank = 7 - Math.floor(idx / 8);
  return String.fromCharCode(97 + file) + String(rank + 1);
}

/**
 * Compute the square index at the given terminal (col, row) relative to the
 * board origin and flip state. Returns -1 if the coords are outside the board.
 *
 * @param {number} col   — 0-based column relative to origin
 * @param {number} row   — 0-based row relative to origin
 * @param {boolean} flipped
 * @returns {number}     — 0-based square index (0=a8), or -1
 */
export function hitTest(col, row, flipped = false) {
  // Board is 32 columns × 16 rows (plus 3-col rank gutter + 1-row file labels)
  // col 0..2: rank gutter, col 3..34: board
  const boardCol = col - 3; // subtract rank gutter
  const boardRow = row;
  if (boardCol < 0 || boardCol >= 32 || boardRow < 0 || boardRow >= 16) return -1;
  const fileIdx = Math.floor(boardCol / 4);  // 0..7
  const rankIdx = Math.floor(boardRow / 2);  // 0..7 (0 = topmost displayed rank)
  const file = flipped ? 7 - fileIdx : fileIdx;
  const rank = flipped ? rankIdx : 7 - rankIdx;
  return rank * 8 + file;  // note: rank 7 (rank8) → index 0..7
  // Wait — index 0 = a8 = rank8, file a
  // rank 7 (rank8) → (7-rank) = 0 in display; rank 0 (rank1) → display row 7
  // Let me redo: square index 0 = a8 means file=0, rank=7
  // sqToIndex: (7-rank)*8 + file
  // We have displayRank = 7-rank (when not flipped)
  // So rank = 7 - displayRank, and displayRank = rankIdx
  // file = fileIdx (when not flipped)
}

// Let me rewrite hitTest properly
/**
 * Mouse hit-test: map terminal coords to a square index.
 * Board cells are 4 cols wide × 2 rows tall.
 * Rank gutter is 3 cols wide (e.g. " 8 ").
 * File label row is 1 row below the board.
 *
 * @param {number} col
 * @param {number} row
 * @param {boolean} [flipped]
 * @returns {number} square index (0=a8), or -1 if outside
 */
export function mouseHitTest(col, row, flipped = false) {
  const boardCol = col - 3; // rank gutter is 3 wide
  const boardRow = row;
  if (boardCol < 0 || boardCol >= 32) return -1;
  if (boardRow < 0 || boardRow >= 16) return -1;

  const fileDisplay = Math.floor(boardCol / 4); // 0..7, left to right
  const rankDisplay = Math.floor(boardRow / 2); // 0..7, top to bottom

  // When not flipped: file a=0 is leftmost, rank 8 is top
  // file = fileDisplay (a=0, h=7)
  // rank = 7 - rankDisplay (rank8=7 is at top, rank1=0 is at bottom)
  const file = flipped ? (7 - fileDisplay) : fileDisplay;
  const rank = flipped ? rankDisplay : (7 - rankDisplay);

  // Index: (7-rank) * 8 + file  where (7-rank) is the FEN row
  return (7 - rank) * 8 + file;
}

// ── Render ────────────────────────────────────────────────────────────────────

const HATCH = '░'; // ░

/**
 * Render the board to an array of strings (one string per row, 35 wide + gutter).
 * Returns 17 rows: 16 board rows + 1 file-label row.
 *
 * @param {BoardState} state
 * @param {RenderOpts} [opts]
 * @returns {string[]}
 */
export function renderBoard(state, opts = {}) {
  const {
    ascii = false,
    hatch = true,
    plain = false,
    colorDepth,
    flipped = state.flipped ?? false,
  } = opts;

  const palette = buildPalette({ plain, colorDepth });
  const pieces = fenToPieces(state.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

  const legalSet = new Set(state.legalDots ?? []);
  const lastFromSq = state.lastFrom ?? -1;
  const lastToSq = state.lastTo ?? -1;
  const checkSq = state.checkSq ?? -1;
  const cursorSq = state.cursor ?? -1;

  const rows = [];

  for (let rankDisplay = 0; rankDisplay < 8; rankDisplay++) {
    const rankNum = flipped ? rankDisplay + 1 : 8 - rankDisplay;

    // Two cell rows per rank
    const cellRow0 = []; // piece row
    const cellRow1 = []; // affordance row

    for (let fileDisplay = 0; fileDisplay < 8; fileDisplay++) {
      const file = flipped ? 7 - fileDisplay : fileDisplay;
      const rank = flipped ? rankDisplay : 7 - rankDisplay;
      const sqIdx = (7 - rank) * 8 + file;

      const isDark = (file + rank) % 2 === 0;
      const isLastMove = sqIdx === lastFromSq || sqIdx === lastToSq;
      const isCheck = sqIdx === checkSq;
      const isCursor = sqIdx === cursorSq;
      const hasLegal = legalSet.has(sqIdx);

      // Background colour sequence
      let bg;
      if (isCheck) bg = palette.check;
      else if (isLastMove) bg = palette.lastMove;
      else if (isDark) bg = palette.dark;
      else bg = palette.light;

      // Piece
      const piece = pieces[sqIdx];
      let pieceStr = '  '; // 2 cols
      if (piece) {
        const isWhite = piece === piece.toUpperCase();
        const fg = isWhite ? palette.pieceW : palette.pieceB;
        if (ascii) {
          pieceStr = fg + ASCII[piece] + RESET + bg + ' ';
        } else {
          const glyph = GLYPHS[piece.toLowerCase()];
          pieceStr = fg + glyph + ' ' + RESET + bg;
        }
      }

      // Hatch character for dark squares (only where no piece glyph)
      const h = (isDark && hatch && !ascii) ? HATCH : ' ';

      // Cursor outline: left bar on col 0
      const cursorLeft  = isCursor ? '\x1b[97m▏' + RESET + bg : h;
      const cursorRight = isCursor ? '\x1b[97m▕' + RESET      : h;

      // Row 0: [h/cursor] [piece or hh] [h/cursor]
      if (piece) {
        cellRow0.push(bg + cursorLeft + pieceStr + cursorRight + RESET);
      } else {
        cellRow0.push(bg + cursorLeft + h + h + cursorRight + RESET);
      }

      // Row 1: affordance — legal dot or check marker
      let aff = h + h;
      if (hasLegal) aff = h + '•' + RESET + bg; // • dot
      else if (isCheck) aff = h + '+' + RESET + bg;
      const affordanceRow1 = bg + h + aff + h + RESET;
      cellRow1.push(affordanceRow1);
    }

    const rankLabel = ` ${rankNum} `;
    rows.push(rankLabel + cellRow0.join(''));
    rows.push('   ' + cellRow1.join(''));
  }

  // File label row
  rows.push('   ' + (flipped
    ? 'h   g   f   e   d   c   b   a  '
    : 'a   b   c   d   e   f   g   h  '
  ));

  return rows;
}

/**
 * Return the width (in terminal columns) of the board render: 35.
 * 3 (rank gutter) + 8 × 4 (squares) = 35
 */
export const BOARD_WIDTH = 35;

/**
 * Return the height (in terminal rows) of the board render: 17.
 * 8 × 2 (squares) + 1 (file labels) = 17
 */
export const BOARD_HEIGHT = 17;
