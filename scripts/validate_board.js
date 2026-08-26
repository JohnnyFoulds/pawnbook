#!/usr/bin/env node
/**
 * Board contrast validator — checks square colours, alpha-composited tints,
 * and piece (pure white/black) contrast against every composite.
 *
 * The bundled chart validator has no compositing step; this script is what
 * makes the board contrast numbers in the plan reproducible and CI-checkable.
 *
 * Usage: node scripts/validate_board.js
 */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(lum1, lum2) {
  const a = lum1 + 0.05, b = lum2 + 0.05;
  return a > b ? a / b : b / a;
}

// Alpha-composite src (with alpha) over dst
function alphaComposite(src, srcAlpha, dst) {
  return src.map((c, i) => Math.round(c * srcAlpha + dst[i] * (1 - srcAlpha)));
}

function hexToOklab(hex) {
  const [r, g, b] = hexToRgb(hex);
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;
  const lc = Math.cbrt(l), mc = Math.cbrt(m), sc = Math.cbrt(s);
  return [
    0.2104542553 * lc + 0.7936177850 * mc - 0.0040720468 * sc,
    1.9779984951 * lc - 2.4285922050 * mc + 0.4505937099 * sc,
    0.0259040371 * lc + 0.7827717662 * mc - 0.8086757660 * sc,
  ];
}

function deltaE(rgb1, rgb2) {
  const h1 = '#' + rgb1.map(c => c.toString(16).padStart(2, '0')).join('');
  const h2 = '#' + rgb2.map(c => c.toString(16).padStart(2, '0')).join('');
  const [l1, a1, b1] = hexToOklab(h1);
  const [l2, a2, b2] = hexToOklab(h2);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2) * 100;
}

// Web board palette (validated values from the plan)
const light = hexToRgb('#b0a89d');
const dark  = hexToRgb('#63666b');
const lastmoveColor = hexToRgb('#d9b310'); const lastmoveAlpha = 0.46;
const checkColor    = hexToRgb('#d03b3b'); const checkAlpha    = 0.45;
const selectedColor = hexToRgb('#3987e5'); const selectedAlpha = 0.44;
const whitePiece = [255, 255, 255];
const blackPiece = [0, 0, 0];
const surfacePage = hexToRgb('#0d0d0d');
const surface1   = hexToRgb('#151517');

// All composites
const composites = {
  'light base':              { rgb: light },
  'dark base':               { rgb: dark },
  'light + lastmove':        { rgb: alphaComposite(lastmoveColor, lastmoveAlpha, light) },
  'dark + lastmove':         { rgb: alphaComposite(lastmoveColor, lastmoveAlpha, dark) },
  'light + check':           { rgb: alphaComposite(checkColor, checkAlpha, light) },
  'dark + check':            { rgb: alphaComposite(checkColor, checkAlpha, dark) },
  'light + selected':        { rgb: alphaComposite(selectedColor, selectedAlpha, light) },
  'dark + selected':         { rgb: alphaComposite(selectedColor, selectedAlpha, dark) },
};

let pass = true;

console.log('\n=== Board contrast validation (web, dark theme) ===\n');

// Square-vs-square Delta E
console.log('Square ΔE (OKLab x100) — target ≥ 8:');
const squareEntries = Object.entries(composites);
for (let i = 0; i < squareEntries.length; i++) {
  for (let j = i + 1; j < squareEntries.length; j++) {
    const [n1, {rgb: r1}] = squareEntries[i];
    const [n2, {rgb: r2}] = squareEntries[j];
    const de = deltaE(r1, r2);
    const status = de >= 8 ? 'PASS' : de >= 6 ? 'WARN' : 'FAIL';
    if (de < 8) pass = false;
    console.log(`  ${n1} <-> ${n2}  ΔE ${de.toFixed(1)}  ${status}`);
  }
}

// Dark square vs surface contrast (must clear 3:1)
console.log('\nDark square contrast vs surface (target ≥ 3:1):');
const darkLum = luminance(dark);
[['surface-page', surfacePage], ['surface-1', surface1]].forEach(([name, surf]) => {
  const c = contrast(darkLum, luminance(surf));
  const status = c >= 3 ? 'PASS' : 'FAIL';
  if (c < 3) pass = false;
  console.log(`  dark vs ${name}  ${c.toFixed(2)}:1  ${status}`);
});

// Piece contrast on every composite
console.log('\nPiece contrast on composites (target ≥ 2.2:1):');
for (const [name, {rgb}] of squareEntries) {
  const sqLum = luminance(rgb);
  const wc = contrast(luminance(whitePiece), sqLum);
  const bc = contrast(luminance(blackPiece), sqLum);
  const status = Math.min(wc, bc) >= 2.2 ? 'PASS' : 'FAIL';
  if (Math.min(wc, bc) < 2.2) pass = false;
  console.log(`  ${name}  white ${wc.toFixed(2)}:1  black ${bc.toFixed(2)}:1  ${status}`);
}

console.log(`\nOverall: ${pass ? 'PASS' : 'FAIL'}\n`);
process.exit(pass ? 0 : 1);
