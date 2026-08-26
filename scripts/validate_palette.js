#!/usr/bin/env node
/**
 * Palette validator — checks categorical, ordinal, and status palettes
 * against the six CVD-safety gates from the dataviz method.
 *
 * Usage:
 *   node scripts/validate_palette.js "<hex,hex,...>" --mode dark
 *   node scripts/validate_palette.js --ordinal "<hex,hex,...>" --mode dark
 *   node scripts/validate_palette.js --surface "#1a1a19" --mode dark "<hex,...>"
 *
 * Gate: adjacent Delta E >= 8 (OKLab x100), normal-vision floor >= 15.
 * Warn: contrast < 3:1 on the surface (must have visible labels or table twin).
 */

// OKLab conversion helpers
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToOklab(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lc = Math.cbrt(l), mc = Math.cbrt(m), sc = Math.cbrt(s);
  return [
    0.2104542553 * lc + 0.7936177850 * mc - 0.0040720468 * sc,
    1.9779984951 * lc - 2.4285922050 * mc + 0.4505937099 * sc,
    0.0259040371 * lc + 0.7827717662 * mc - 0.8086757660 * sc,
  ];
}

function hexToOklab(hex) {
  const h = hex.replace('#', '');
  const r = srgbToLinear(parseInt(h.slice(0, 2), 16));
  const g = srgbToLinear(parseInt(h.slice(2, 4), 16));
  const b = srgbToLinear(parseInt(h.slice(4, 6), 16));
  return linearToOklab(r, g, b);
}

function deltaE(hex1, hex2) {
  const [l1, a1, b1] = hexToOklab(hex1);
  const [l2, a2, b2] = hexToOklab(hex2);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2) * 100;
}

function luminance(hex) {
  const h = hex.replace('#', '');
  const r = srgbToLinear(parseInt(h.slice(0, 2), 16));
  const g = srgbToLinear(parseInt(h.slice(2, 4), 16));
  const b = srgbToLinear(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(hex, surface) {
  const l1 = luminance(hex) + 0.05;
  const l2 = luminance(surface) + 0.05;
  return l1 > l2 ? l1 / l2 : l2 / l1;
}

const args = process.argv.slice(2);
const ordinal = args.includes('--ordinal');
const modeIdx = args.indexOf('--mode');
const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'dark';
const surfaceIdx = args.indexOf('--surface');
const surfaceOverride = surfaceIdx >= 0 ? args[surfaceIdx + 1] : null;
const defaultSurface = mode === 'dark' ? '#1a1a19' : '#fcfcfb';
const surface = surfaceOverride || defaultSurface;

const hexArg = args.find(a => a.startsWith('#') || a.includes(','));
if (!hexArg) {
  console.error('Usage: validate_palette.js "<hex,hex,...>" [--ordinal] [--mode light|dark]');
  process.exit(1);
}

const palette = hexArg.split(',').map(h => h.trim());

console.log(`\nValidating ${ordinal ? 'ordinal' : 'categorical'} palette (${mode} mode, surface ${surface}):`);
console.log(`  ${palette.join('  ')}\n`);

let pass = true;

// Adjacent pair checks
console.log('Adjacent pair Delta E (OKLab x100):');
for (let i = 0; i < palette.length - 1; i++) {
  const de = deltaE(palette[i], palette[i + 1]);
  const status = de >= 8 ? 'PASS' : de >= 6 ? 'WARN (needs secondary encoding)' : 'FAIL';
  if (de < 8) pass = false;
  console.log(`  ${palette[i]} <-> ${palette[i + 1]}  ΔE ${de.toFixed(1)}  ${status}`);
}

// Contrast against surface
console.log('\nContrast against surface:');
for (const hex of palette) {
  const c = contrast(hex, surface);
  const status = c >= 3 ? 'PASS' : c >= 2 ? 'WARN (add labels or table twin)' : 'FAIL';
  if (c < 2) pass = false;
  console.log(`  ${hex}  ${c.toFixed(2)}:1  ${status}`);
}

// Ordinal: monotone lightness check
if (ordinal) {
  console.log('\nOrdinal monotone lightness:');
  const labs = palette.map(hexToOklab);
  let mono = true;
  for (let i = 0; i < labs.length - 1; i++) {
    if (labs[i][0] >= labs[i + 1][0]) { mono = false; break; }
  }
  const status = mono ? 'PASS' : 'FAIL (not monotone increasing)';
  if (!mono) pass = false;
  console.log(`  ${status}`);
}

console.log(`\nOverall: ${pass ? 'PASS' : 'FAIL'}\n`);
process.exit(pass ? 0 : 1);
