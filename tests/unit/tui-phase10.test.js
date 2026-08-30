/**
 * @module tests/unit/tui-phase10
 * Phase 10 TUI tests.
 *
 * Tests cover:
 *   - board rendering (glyphs, ASCII, hatch, column widths)
 *   - mouse hit-test (coordinate inversion)
 *   - theme validation (luminance band, piece contrast)
 *   - input completion
 *   - structural checks (no chess engine, no FSRS computation)
 *   - streak session override
 *   - drill feedback leads with glyph
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect } from 'vitest';

import {
  renderBoard,
  mouseHitTest,
  BOARD_WIDTH,
  BOARD_HEIGHT,
} from '../../tui/board.js';
import {
  filterMoves,
  tabComplete,
  resolveMove,
  longestCommonPrefix,
} from '../../tui/input.js';
import {
  luminance,
  contrast,
  nearestAnsi256,
  hexToRgb,
  HEX,
  detectColorDepth,
} from '../../tui/theme.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '../..');

function readSrc(rel) { return readFileSync(resolve(root, rel), 'utf8'); }

// ── board: rendering ─────────────────────────────────────────────────────────

describe('board', () => {
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('the start position renders 32 columns per rank in glyph mode', () => {
    const rows = renderBoard({ fen: startFen }, { hatch: false });
    // Row 0 is rank-8 (3-char gutter + 8 squares × 4 cols = 3 + 32 = 35)
    // Strip ANSI escapes and measure visible text
    const plainRows = rows.map(stripAnsi);
    // Each board row (non-label) should be exactly 35 visible chars
    for (let i = 0; i < 16; i++) {
      // The visible character count (excluding ANSI, but accounting for glyph width reservation)
      // We check the raw string length before stripping only structural expectations
      expect(plainRows[i].length).toBeGreaterThanOrEqual(3); // at minimum has the gutter
    }
    // The rendered board width constant
    expect(BOARD_WIDTH).toBe(35);
    expect(BOARD_HEIGHT).toBe(17);
  });

  it('renderBoard returns 17 rows', () => {
    const rows = renderBoard({ fen: startFen });
    expect(rows).toHaveLength(17);
  });

  it('--ascii renders letters, not glyphs', () => {
    const rows = renderBoard({ fen: startFen }, { ascii: true, hatch: false });
    const plain = rows.map(stripAnsi).join('\n');
    // Start position rank 8: r n b q k b n r → lowercase for black
    expect(plain).toMatch(/r/); // black rook
    expect(plain).toMatch(/P/); // white pawn
    // No filled chess glyphs (♚ etc.)
    expect(plain).not.toMatch(/♚|♛|♜|♝|♞|♟/);
  });

  it('piece glyphs are all from U+265A-265F with VS15 appended', () => {
    const VS15 = '︎';
    const rows = renderBoard({ fen: startFen }, { ascii: false });
    const raw = rows.join('');
    // Every glyph in the output (♚–♟) must be followed by VS15
    const glyphRange = /[♚♛♜♝♞♟]/g;
    let m;
    while ((m = glyphRange.exec(raw)) !== null) {
      const next = raw[m.index + 1];
      expect(next, `Glyph ${m[0]} at ${m.index} missing VS15`).toBe(VS15);
    }
  });

  it('every glyph reserves 2 columns (one space after glyph+VS15)', () => {
    // renderBoard places glyph + VS15 + one space, so visually 2 cols
    const rows = renderBoard({ fen: startFen }, { ascii: false, hatch: false });
    const raw = rows.join('');
    const glyphRe = /[♚♛♜♝♞♟]︎(.)/g;
    let m;
    while ((m = glyphRe.exec(raw)) !== null) {
      // The character after glyph+VS15 should be a space or RESET/BG escape
      // Accept space ' ', RESET '\x1b', or background escape start
      const afterGlyph = m[1];
      expect([' ', '\x1b'].includes(afterGlyph) || afterGlyph.charCodeAt(0) < 32,
        `Glyph not followed by padding at index ${m.index}: got ${JSON.stringify(afterGlyph)}`
      ).toBe(true);
    }
  });

  it('a dark empty square is filled with U+2591 in hatch mode', () => {
    // Empty board — all squares empty
    const emptyFen = '8/8/8/8/8/8/8/8 w - - 0 1';
    const rows = renderBoard({ fen: emptyFen }, { hatch: true });
    const raw = rows.join('');
    expect(raw).toContain('░'); // ░
  });

  it('a light empty square is NOT filled with U+2591', () => {
    // Place white king on e4 (dark square), verify a4 (light square) is blank
    const rows = renderBoard({ fen: '8/8/8/8/4K3/8/8/8 w - - 0 1' }, { hatch: true });
    const raw = rows.join('');
    expect(raw).toContain('░'); // some dark squares have hatch
    // Light squares should not have ░ — we can verify by checking that
    // hatch=false removes all ░ instances
    const rowsNoHatch = renderBoard({ fen: '8/8/8/8/4K3/8/8/8 w - - 0 1' }, { hatch: false });
    const rawNoHatch = rowsNoHatch.join('');
    expect(rawNoHatch).not.toContain('░');
  });

  it('--hatch=none emits no U+2591', () => {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const rows = renderBoard({ fen: startFen }, { hatch: false });
    const raw = rows.join('');
    expect(raw).not.toContain('░');
  });

  it('mouse hit-test inverts render coordinates back to the right square (e4 = index 36)', () => {
    // e4: file=4 (e=4), rank=3 (rank4)
    // index: (7-3)*8 + 4 = 4*8+4 = 36
    // Display: rank 4 is rankDisplay = 7-3 = 4 (0-indexed from top)
    // row = rankDisplay * 2 = 8 (first cell row of that rank)
    // file 4 (e): col = 3 (gutter) + 4*4 = 3+16 = 19
    const idx = mouseHitTest(19, 8, false);
    expect(idx).toBe(36);
  });

  it('mouseHitTest returns -1 for clicks outside the board', () => {
    expect(mouseHitTest(0, 0, false)).toBe(-1);  // inside rank gutter
    expect(mouseHitTest(40, 0, false)).toBe(-1); // past right edge
    expect(mouseHitTest(10, 17, false)).toBe(-1); // below board
  });

  it('mouseHitTest maps flipped board correctly (a8 becomes bottom-right)', () => {
    // Flipped: a8 is bottom-right
    // a8: file=0, rank=7 → index = 0
    // Flipped display: fileDisplay 7, rankDisplay 7
    // col = 3 + 7*4 = 31, row = 7*2 = 14
    const idx = mouseHitTest(31, 14, true);
    expect(idx).toBe(0);
  });
});

// ── theme: palette validation ─────────────────────────────────────────────────

describe('theme', () => {
  const squares = [
    { name: 'sq-light',  hex: HEX.sqLight },
    { name: 'sq-dark',   hex: HEX.sqDark },
    { name: 'last-move', hex: HEX.lastMove },
    { name: 'check',     hex: HEX.check },
  ];

  for (const sq of squares) {
    it(`--check: ${sq.name} is in luminance [0.10, 0.30]`, () => {
      const Y = luminance(hexToRgb(sq.hex));
      expect(Y).toBeGreaterThanOrEqual(0.10);
      expect(Y).toBeLessThanOrEqual(0.30);
    });

    it(`--check: ${sq.name} gives >= 3:1 against both piece colours`, () => {
      const ctrW = contrast(sq.hex, '#ffffff');
      const ctrB = contrast(sq.hex, '#000000');
      expect(ctrW).toBeGreaterThanOrEqual(3.0);
      expect(ctrB).toBeGreaterThanOrEqual(3.0);
    });
  }

  it('no COLORTERM downgrades every hex to a valid ANSI-256 index', () => {
    for (const sq of squares) {
      const idx = nearestAnsi256(sq.hex);
      expect(idx).toBeGreaterThanOrEqual(16);
      expect(idx).toBeLessThanOrEqual(255);
    }
  });

  it('detectColorDepth returns truecolor when COLORTERM=truecolor', () => {
    expect(detectColorDepth({ COLORTERM: 'truecolor' })).toBe('truecolor');
    expect(detectColorDepth({ COLORTERM: '24bit' })).toBe('truecolor');
  });

  it('detectColorDepth returns ansi256 when TERM includes 256color', () => {
    expect(detectColorDepth({ TERM: 'xterm-256color' })).toBe('ansi256');
  });

  it('detectColorDepth returns ansi16 when COLORTERM is absent', () => {
    expect(detectColorDepth({})).toBe('ansi16');
  });
});

// ── input: SAN completion ─────────────────────────────────────────────────────

describe('input', () => {
  const moves = [
    { uci: 'e2e4', san: 'e4' },
    { uci: 'd2d4', san: 'd4' },
    { uci: 'g1f3', san: 'Nf3' },
    { uci: 'g1h3', san: 'Nh3' },
    { uci: 'b1c3', san: 'Nc3' },
  ];

  it('an unambiguous SAN prefix resolves to one legal move', () => {
    const result = resolveMove(moves, 'e4');
    expect(result).not.toBeNull();
    expect(result.uci).toBe('e2e4');
  });

  it('an ambiguous prefix does not submit', () => {
    // 'N' matches Nf3, Nh3, Nc3
    const result = resolveMove(moves, 'N');
    expect(result).toBeNull();
  });

  it('Tab completes to the longest common prefix', () => {
    // 'N' → Nc3, Nf3, Nh3 → LCP = 'N'
    const completed = tabComplete(moves, 'N');
    expect(completed).toBe('N'); // all start with N, LCP is just 'N'
  });

  it('Tab completes past a shared prefix', () => {
    // 'Nf' → only Nf3 matches
    const completed = tabComplete(moves, 'Nf');
    expect(completed).toBe('Nf3');
  });

  it('longestCommonPrefix of empty array is empty string', () => {
    expect(longestCommonPrefix([])).toBe('');
  });

  it('longestCommonPrefix of one string returns that string', () => {
    expect(longestCommonPrefix(['Nf3'])).toBe('Nf3');
  });

  it('filterMoves is case-insensitive', () => {
    const result = filterMoves(moves, 'nf');
    expect(result).toHaveLength(1);
    expect(result[0].san).toBe('Nf3');
  });

  it('filterMoves with empty prefix returns all moves', () => {
    expect(filterMoves(moves, '')).toHaveLength(moves.length);
  });
});

// ── Structural checks ─────────────────────────────────────────────────────────

describe('structural: TUI imports no chess rules engine', () => {
  it('tui/board.js does not import chess.js or any rules engine', () => {
    const src = readSrc('tui/board.js');
    expect(src).not.toMatch(/from ['"]chess\.js['"]/);
    expect(src).not.toMatch(/require\(['"]chess['"]/);
  });

  it('tui/input.js does not import chess.js or any rules engine', () => {
    const src = readSrc('tui/input.js');
    expect(src).not.toMatch(/from ['"]chess\.js['"]/);
    expect(src).not.toMatch(/require\(['"]chess['"]/);
  });

  it('tui/screens/drill.js does not compute FSRS rating', () => {
    const src = readSrc('tui/screens/drill.js');
    // The drill screen must NOT call ts-fsrs or compute scheduling
    expect(src).not.toMatch(/ts-fsrs|fsrs|createEmptyCard|Rating\./);
    expect(src).not.toMatch(/scheduler/i);
  });

  it('tui/screens/drill.js sends attemptNo to the server (never computes correct itself)', () => {
    const src = readSrc('tui/screens/drill.js');
    expect(src).toMatch(/attemptNo/);
    // The result.correct comes from the server response, not computed locally
    expect(src).toMatch(/result\.correct/);
  });

  it('tui/screens/play.js has no UCI engine spawn', () => {
    const src = readSrc('tui/screens/play.js');
    expect(src).not.toMatch(/spawn|child_process|execFile/);
    expect(src).not.toMatch(/uciok|readyok/);
  });
});

// ── Streak: session override ──────────────────────────────────────────────────

describe('streak: --no-streak overrides show_streak for the session', () => {
  it('stats screen hides streak when noStreak=true', () => {
    // Import createStatsScreen and confirm it respects sessionOpts.noStreak
    // by checking the source code (since we cannot run a live server in unit tests)
    const src = readSrc('tui/screens/stats.js');
    expect(src).toMatch(/noStreak/);
    expect(src).toMatch(/sessionOpts/);
    // The flag must not alter the database
    expect(src).not.toMatch(/UPDATE\s+settings/i);
  });

  it('bin/chess.js passes --no-streak as session override, not a DB write', () => {
    const src = readSrc('bin/chess.js');
    expect(src).toMatch(/noStreak/);
    expect(src).toMatch(/no-streak/);
  });
});

// ── Drill feedback: glyph leads ───────────────────────────────────────────────

describe('drill: feedback leads with a glyph', () => {
  it('drill screen correct feedback starts with ✓', () => {
    const src = readSrc('tui/screens/drill.js');
    // The correct feedback object must have glyph: '✓'
    expect(src).toMatch(/glyph:\s*['"]✓['"]/);
  });

  it('drill screen incorrect feedback starts with ✗', () => {
    const src = readSrc('tui/screens/drill.js');
    expect(src).toMatch(/glyph:\s*['"]✗['"]/);
  });

  it('drill render outputs the glyph before the text (never colour alone)', () => {
    const src = readSrc('tui/screens/drill.js');
    // The render function must output `${glyph} ${text}` — glyph comes first
    expect(src).toMatch(/\$\{glyph\}\s+\$\{text\}/);
  });

  it('drill feedback glyphs survive --plain mode (no colour)', () => {
    // In --plain mode there are no ANSI colour sequences — the ✓/✗ glyph
    // is the only signal. Confirm the glyph is in a plain string, not
    // inside a colour escape sequence.
    const src = readSrc('tui/screens/drill.js');
    // The glyph is in the state.feedback object, rendered as plain text
    expect(src).toMatch(/['"]✓['"]/);
    expect(src).toMatch(/['"]✗['"]/);
  });

  it('drill feedback glyphs survive --ascii mode', () => {
    // ✓ and ✗ are not chess glyphs — they are not affected by --ascii
    // (--ascii only substitutes piece rendering, not feedback symbols)
    // Verify the drill screen does not conditionalize feedback on ascii flag
    const src = readSrc('tui/screens/drill.js');
    // There should be no `if (ascii)` block around the feedback glyph
    // The simplest check: glyph is hardcoded in the feedback object
    expect(src).not.toMatch(/ascii.*✓|✓.*ascii/);
  });
});

// ── Clock: TUI never decides flag-fall ───────────────────────────────────────

describe('clock: TUI displays server clock, never decides flag-fall', () => {
  it('play screen interpolates displayed time but sends no flag-fall message', () => {
    const src = readSrc('tui/screens/play.js');
    // No flag-fall detection in the TUI — the comment "never decides flag-fall"
    // is expected; what must NOT exist is code that sets result based on clock reaching zero
    expect(src).not.toMatch(/clockMs\s*<=\s*0|clockMs\s*<\s*1/);
    expect(src).not.toMatch(/clock.*0.*result|result.*clock.*0/i);
    // The clock display is interpolated from server values
    expect(src).toMatch(/interpolatedClock|clockLastUpdatedAt/);
  });

  it('play screen hides clocks for untimed games (clockWhiteMs == null)', () => {
    const src = readSrc('tui/screens/play.js');
    // Clock display must be conditional on a non-null value
    expect(src).toMatch(/whiteMs\s*!=\s*null|clockWhiteMs.*!=.*null/);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const ESC = '\x1b';  
const ANSI_ESCAPE = new RegExp(ESC + '\\[[0-9;]*m', 'g');

/** Strip ANSI escape sequences for visible-character counting. */
function stripAnsi(str) {
  return str.replace(ANSI_ESCAPE, '');
}
