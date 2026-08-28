#!/usr/bin/env node
/**
 * scripts/refit-strength.js — re-fit the strength-model coefficients.
 *
 * Joins strength_samples (side='opponent') to games.opponent_elo, runs a
 * weighted least-squares regression of opponent_elo ~ ase, and appends a
 * new version entry to calibration/strength-model.json.
 *
 * Refuses to fit unless at least 20 samples span at least 3 distinct
 * opponent_elo values — a two-point slope from one rating is worthless.
 *
 * The script NEVER writes src/shared/balance.js; it prints the three
 * constants to paste, so a coefficient change stays a reviewed human commit.
 *
 * Usage:
 *   node scripts/refit-strength.js [--db ./data/chess.db] [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import Database from 'better-sqlite3';

import {
  STRENGTH_ANCHOR_ELO, STRENGTH_MIN_PLIES, STRENGTH_COEFF_VERSION,
} from '../src/shared/balance.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const MODEL_PATH = resolve(ROOT, 'calibration/strength-model.json');
const MIN_SAMPLES = 20;
const MIN_DISTINCT = 3;
const SD_FLOOR = 0.01; // prevents infinite weight for sd=0 (flawless games)

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : def;
}
const DB_PATH = flag('--db', './data/chess.db');
const DRY_RUN = args.includes('--dry-run');

const db = new Database(DB_PATH, { readonly: true });

// ── Collect labelled samples ──────────────────────────────────────────────────

const rows = db.prepare(`
  SELECT ss.ase, ss.sd, ss.n, g.opponent_elo
  FROM strength_samples ss
  JOIN games g ON ss.game_id = g.id
  WHERE ss.side = 'opponent'
    AND g.opponent_elo IS NOT NULL
    AND ss.n >= ?
`).all(STRENGTH_MIN_PLIES);

const nSamples = rows.length;
const distinctRatings = new Set(rows.map(r => r.opponent_elo)).size;

if (nSamples < MIN_SAMPLES || distinctRatings < MIN_DISTINCT) {
  console.error(
    `Refusing to fit: need >= ${MIN_SAMPLES} samples across >= ${MIN_DISTINCT} distinct` +
    ` opponent_elo values; got ${nSamples} samples across ${distinctRatings} distinct ratings.` +
    '\nPlay more games against rated opponents, then re-run.'
  );
  process.exit(1);
}

// ── Weighted least squares: opponent_elo ~ ase ────────────────────────────────
// weight = n / max(sd, SD_FLOOR)^2

let sumW = 0, sumWX = 0, sumWY = 0, sumWX2 = 0, sumWXY = 0;
for (const r of rows) {
  const w = r.n / (Math.max(r.sd, SD_FLOOR) ** 2);
  sumW   += w;
  sumWX  += w * r.ase;
  sumWY  += w * r.opponent_elo;
  sumWX2 += w * r.ase * r.ase;
  sumWXY += w * r.ase * r.opponent_elo;
}
const denom = sumW * sumWX2 - sumWX * sumWX;
if (denom === 0) {
  console.error('Degenerate data: all ase values are identical. Cannot fit a slope.');
  process.exit(1);
}
const slope     = (sumW * sumWXY - sumWX * sumWY) / denom;
const intercept = (sumWY - slope * sumWX) / sumW;

// Anchor pair: solve for ase at STRENGTH_ANCHOR_ELO
const newAnchorAse = (STRENGTH_ANCHOR_ELO - intercept) / slope;
const newEloPerAse  = -slope; // slope is negative (higher ase → lower elo)

// ── Residual MAE ──────────────────────────────────────────────────────────────

let sumAbsErr = 0;
for (const r of rows) {
  const predicted = intercept + slope * r.ase;
  sumAbsErr += Math.abs(r.opponent_elo - predicted);
}
const residualMae = sumAbsErr / nSamples;

// ── Report ────────────────────────────────────────────────────────────────────

const nextVersion = STRENGTH_COEFF_VERSION + 1;

console.log(`\nRefit complete (${nSamples} samples, ${distinctRatings} distinct ratings)`);
console.log(`  Residual MAE: ${residualMae.toFixed(1)} Elo`);
console.log(`\nPaste into src/shared/balance.js (then bump STRENGTH_COEFF_VERSION to ${nextVersion}):`);
console.log(`  STRENGTH_ANCHOR_ELO  = ${STRENGTH_ANCHOR_ELO}`);
console.log(`  STRENGTH_ANCHOR_ASE  = ${newAnchorAse.toFixed(6)}`);
console.log(`  STRENGTH_ELO_PER_ASE = ${Math.round(newEloPerAse)}`);
console.log(`  STRENGTH_COEFF_VERSION = ${nextVersion}`);
console.log(`\nAdd to docs/game/balance.md § Changelog:`);
console.log(`  ${new Date().toISOString().slice(0, 10)}  v${nextVersion}: refit from ${nSamples} samples / ${distinctRatings} ratings; residualMae=${residualMae.toFixed(1)}`);

if (DRY_RUN) {
  console.log('\n[dry-run] calibration/strength-model.json not updated.');
  process.exit(0);
}

// ── Append to calibration/strength-model.json ─────────────────────────────────

const history = JSON.parse(readFileSync(MODEL_PATH, 'utf8'));
if (history.some(e => e.version === nextVersion)) {
  console.error(`Version ${nextVersion} already exists in strength-model.json. Bump STRENGTH_COEFF_VERSION first.`);
  process.exit(1);
}
history.push({
  version: nextVersion,
  fittedAt: new Date().toISOString().slice(0, 10),
  anchorElo: STRENGTH_ANCHOR_ELO,
  anchorAse: parseFloat(newAnchorAse.toFixed(6)),
  eloPerAse: Math.round(newEloPerAse),
  source: `WLS regression from ${nSamples} opponent samples across ${distinctRatings} distinct ratings`,
  nSamples,
  distinctRatings,
  residualMae: parseFloat(residualMae.toFixed(1)),
});
writeFileSync(MODEL_PATH, JSON.stringify(history, null, 2) + '\n');
console.log(`\nAppended version ${nextVersion} to calibration/strength-model.json`);
