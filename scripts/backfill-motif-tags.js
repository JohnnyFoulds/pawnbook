#!/usr/bin/env node
/**
 * scripts/backfill-motif-tags.js — Phase 19h backfill
 *
 * Retroactively classifies existing puzzles that have no motif_tag.
 * Calls classifyMotif (chess.js only, no engine) on each untagged row
 * and updates motif_tag in-place.
 *
 * Safe to run more than once: only touches rows WHERE motif_tag IS NULL.
 *
 * Usage:
 *   node scripts/backfill-motif-tags.js [--db ./data/chess.db] [--dry-run]
 */

import Database from 'better-sqlite3';

import { applySchema } from '../src/adapters/sqlite/schema.js';
import { classifyMotif } from '../src/domain/analysis/motif-classifier.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : def;
}
const DB_PATH = flag('--db', './data/chess.db');
const DRY_RUN = args.includes('--dry-run');

// ── Open DB ───────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
applySchema(db);

console.log(`backfill-motif-tags: opening ${DB_PATH}${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);

// ── Query untagged tactical puzzles ──────────────────────────────────────────

const rows = db.prepare(`
  SELECT id, fen, played_move_uci, side_to_move
  FROM puzzles
  WHERE motif_tag IS NULL
    AND played_move_uci IS NOT NULL
    AND fen IS NOT NULL
    AND side_to_move IS NOT NULL
    AND kind = 'tactical'
`).all();

console.log(`backfill-motif-tags: ${rows.length} untagged tactical puzzle(s) to classify`);

if (rows.length === 0) {
  console.log('backfill-motif-tags: nothing to do');
  process.exit(0);
}

// ── Classify and update ───────────────────────────────────────────────────────

const update = db.prepare('UPDATE puzzles SET motif_tag = ? WHERE id = ?');

const counts = {};
let classified = 0;
let skipped = 0;

const runAll = db.transaction(() => {
  for (const row of rows) {
    const tag = classifyMotif(row.fen, row.played_move_uci, row.side_to_move);
    if (tag) {
      if (!DRY_RUN) update.run(tag, row.id);
      counts[tag] = (counts[tag] ?? 0) + 1;
      classified++;
    } else {
      skipped++;
    }
  }
});

runAll();

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`backfill-motif-tags: classified ${classified}, unclassifiable ${skipped}`);
for (const [tag, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tag}: ${n}`);
}
if (DRY_RUN) console.log('backfill-motif-tags: dry-run — no rows were written');
