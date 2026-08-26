/**
 * @module tui/theme
 * Validated hex palette for the TUI board.
 * Pieces are pinned to pure #ffffff / #000000, which forces every square
 * into luminance [0.10, 0.30] (else one piece colour drops below 3:1).
 *
 * Board palette (validated — see docs/game/art_direction.md):
 *   sq-light  #8f8b84  Y=0.260  white 3.39:1  black 6.19:1
 *   sq-dark   #5f6166  Y=0.119  white 6.20:1  black 3.39:1
 *   last-move #78753f  Y=0.171  white 4.76:1  black 4.41:1
 *   check     #96564d  Y=0.137  white 5.62:1  black 3.74:1
 *
 * All in luminance [0.10, 0.30]. Worst piece/square 3.39:1 ≥ 3:1 PASS.
 *
 * Run `node tui/theme.js --check` to reproduce the validation table.
 *
 * @typedef {{ r: number, g: number, b: number }} RGB
 */

/** @type {Record<string, string>} */
export const HEX = {
  sqLight:  '#8f8b84',
  sqDark:   '#5f6166',
  lastMove: '#78753f',
  check:    '#96564d',
  cursor:   null, // rendered as a hollow outline box — no fill
  piece:    { white: '#ffffff', black: '#000000' },
};

// ── Colour utilities ─────────────────────────────────────────────────────────

/**
 * Parse a hex string to { r, g, b } in [0, 255].
 * @param {string} hex
 * @returns {RGB}
 */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Relative luminance (WCAG 2.1).
 * @param {RGB} rgb
 * @returns {number}
 */
export function luminance({ r, g, b }) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * WCAG contrast ratio.
 * @param {string} hex1
 * @param {string} hex2
 * @returns {number}
 */
export function contrast(hex1, hex2) {
  const l1 = luminance(hexToRgb(hex1));
  const l2 = luminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── ANSI-256 downgrade ───────────────────────────────────────────────────────

/**
 * Map a 6×6×6 cube index to its RGB approximation.
 * @param {number} idx — 0..215
 * @returns {RGB}
 */
function cubeToRgb(idx) {
  const r = Math.floor(idx / 36);
  const g = Math.floor((idx % 36) / 6);
  const b = idx % 6;
  const step = (n) => n === 0 ? 0 : 55 + n * 40;
  return { r: step(r), g: step(g), b: step(b) };
}

/**
 * Map a 24-step grayscale index (232..255) to its RGB.
 * @param {number} ansi
 * @returns {RGB}
 */
function grayToRgb(ansi) {
  const v = 8 + (ansi - 232) * 10;
  return { r: v, g: v, b: v };
}

/**
 * Squared Euclidean distance in RGB space.
 * @param {RGB} a
 * @param {RGB} b
 * @returns {number}
 */
function rgbDist(a, b) {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

/**
 * Nearest ANSI-256 colour index for a hex string.
 * Searches the 6×6×6 cube (16..231) and the 24-step grayscale (232..255).
 * @param {string} hex
 * @returns {number}
 */
export function nearestAnsi256(hex) {
  const target = hexToRgb(hex);
  let best = 16;
  let bestDist = Infinity;
  // 6×6×6 cube
  for (let i = 0; i < 216; i++) {
    const d = rgbDist(target, cubeToRgb(i));
    if (d < bestDist) { bestDist = d; best = 16 + i; }
  }
  // 24-step grayscale
  for (let i = 232; i <= 255; i++) {
    const d = rgbDist(target, grayToRgb(i));
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// ── COLORTERM detection ───────────────────────────────────────────────────────

/** @returns {'truecolor' | 'ansi256' | 'ansi16'} */
export function detectColorDepth(env = process.env) {
  const ct = (env.COLORTERM || '').toLowerCase();
  if (ct === 'truecolor' || ct === '24bit') return 'truecolor';
  const term = (env.TERM || '').toLowerCase();
  if (term.includes('256color')) return 'ansi256';
  return 'ansi16';
}

/**
 * ANSI escape to set a truecolor background.
 * @param {number} r @param {number} g @param {number} b
 */
export function bgRgb(r, g, b) { return `\x1b[48;2;${r};${g};${b}m`; }

/**
 * ANSI escape to set a truecolor foreground.
 * @param {number} r @param {number} g @param {number} b
 */
export function fgRgb(r, g, b) { return `\x1b[38;2;${r};${g};${b}m`; }

/**
 * ANSI escape to set an ANSI-256 background.
 * @param {number} n
 */
export function bgAnsi256(n) { return `\x1b[48;5;${n}m`; }

/**
 * ANSI escape to set an ANSI-256 foreground.
 * @param {number} n
 */
export function fgAnsi256(n) { return `\x1b[38;5;${n}m`; }

export const RESET = '\x1b[0m';

/**
 * Build a palette adapted to the detected colour depth.
 * Returns ESC sequences for each square role.
 * @param {object} opts
 * @param {boolean} [opts.plain] — force 16-colour path
 * @param {'truecolor'|'ansi256'|'ansi16'} [opts.colorDepth]
 * @returns {Record<string, string>}
 */
export function buildPalette({ plain = false, colorDepth } = {}) {
  const depth = plain ? 'ansi16' : (colorDepth ?? detectColorDepth());

  if (depth === 'truecolor') {
    const sq = (hex) => { const { r, g, b } = hexToRgb(hex); return bgRgb(r, g, b); };
    const fg = (hex) => { const { r, g, b } = hexToRgb(hex); return fgRgb(r, g, b); };
    return {
      light:     sq(HEX.sqLight),
      dark:      sq(HEX.sqDark),
      lastMove:  sq(HEX.lastMove),
      check:     sq(HEX.check),
      pieceW:    fg('#ffffff'),
      pieceB:    fg('#000000'),
      reset:     RESET,
    };
  }

  if (depth === 'ansi256') {
    const sq = (hex) => bgAnsi256(nearestAnsi256(hex));
    return {
      light:     sq(HEX.sqLight),
      dark:      sq(HEX.sqDark),
      lastMove:  sq(HEX.lastMove),
      check:     sq(HEX.check),
      pieceW:    fgAnsi256(15), // bright white
      pieceB:    fgAnsi256(0),  // black
      reset:     RESET,
    };
  }

  // ansi16 — reverse-video for state squares, no tints
  return {
    light:     '\x1b[47m',   // white bg (light square)
    dark:      '\x1b[100m',  // bright black bg (dark square)
    lastMove:  '\x1b[7m',    // reverse-video
    check:     '\x1b[41m',   // red bg
    pieceW:    '\x1b[97m',   // bright white fg
    pieceB:    '\x1b[30m',   // black fg
    reset:     RESET,
  };
}

// ── Validation (--check mode) ─────────────────────────────────────────────────

/**
 * Print a validation table: luminance, piece contrast for each square colour.
 * Exits 1 if any check fails.
 */
export function runCheck() {
  const squares = [
    { name: 'sq-light',  hex: HEX.sqLight },
    { name: 'sq-dark',   hex: HEX.sqDark },
    { name: 'last-move', hex: HEX.lastMove },
    { name: 'check',     hex: HEX.check },
  ];

  let failed = false;
  const rows = [];

  for (const sq of squares) {
    const Y = luminance(hexToRgb(sq.hex));
    const ctrW = contrast(sq.hex, '#ffffff');
    const ctrB = contrast(sq.hex, '#000000');
    const inBand = Y >= 0.10 && Y <= 0.30;
    const ctrOk = ctrW >= 3.0 && ctrB >= 3.0;
    if (!inBand || !ctrOk) failed = true;
    rows.push({
      name: sq.name,
      hex: sq.hex,
      Y: Y.toFixed(3),
      white: ctrW.toFixed(2) + ':1',
      black: ctrB.toFixed(2) + ':1',
      band: inBand ? 'PASS' : 'FAIL',
      contrast: ctrOk ? 'PASS' : 'FAIL',
    });
  }

  console.table(rows);
  if (failed) {
    console.error('Validation FAILED — see rows above.');
    process.exit(1);
  } else {
    console.log('All checks PASS.');
  }
}

// Run validation when invoked directly: node tui/theme.js --check
if (process.argv[1]?.endsWith('theme.js') && process.argv.includes('--check')) {
  runCheck();
}
