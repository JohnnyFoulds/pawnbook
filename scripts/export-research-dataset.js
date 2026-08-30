#!/usr/bin/env node
/**
 * Export pawnbook research dataset.
 * Output: NDJSON per table + PGN per game + data dictionary + SHA-256 manifest.
 * Two exports at the same book_version produce byte-identical results (invariant 13).
 *
 * Usage:
 *   node scripts/export-research-dataset.js [--output ./export] [--anonymise]
 */

import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import Database from 'better-sqlite3';

import { sortedNdjson, buildPgn, computeManifest } from './lib/export-utils.js';

const __dir = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const outputArg = args.indexOf('--output');
const outputDir = outputArg !== -1 ? args[outputArg + 1] : join(__dir, '../export');
const anonymise = args.includes('--anonymise');

const dbPath = join(__dir, '../data/chess.db');

function run() {
  const db = new Database(dbPath, { readonly: true });

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'pgn'), { recursive: true });

  // Files to include in manifest (excludes sidecar.json and manifest.sha256 itself)
  /** @type {Map<string, string>} filename → content */
  const manifestFiles = new Map();

  // ── Table exports ─────────────────────────────────────────────────────────

  const TABLES = [
    {
      file: 'games.ndjson',
      sql: 'SELECT * FROM games ORDER BY id',
      transform: anonymise ? row => Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'elo_before' && k !== 'elo_after')) : null,
    },
    { file: 'game_moves.ndjson', sql: 'SELECT * FROM game_moves ORDER BY game_id, ply' },
    { file: 'move_evals.ndjson', sql: 'SELECT * FROM move_evals ORDER BY game_id, ply' },
    { file: 'rep_observations.ndjson', sql: 'SELECT * FROM rep_observations ORDER BY game_id, ply' },
    { file: 'rep_deviations.ndjson', sql: 'SELECT * FROM rep_deviations ORDER BY game_id, ply, rowid' },
    { file: 'rep_challenges.ndjson', sql: 'SELECT * FROM rep_challenges ORDER BY id' },
    { file: 'rep_audits.ndjson', sql: 'SELECT * FROM rep_audits ORDER BY id' },
    { file: 'rep_changelog.ndjson', sql: 'SELECT * FROM rep_changelog ORDER BY at, id' },
    { file: 'rep_suppressions.ndjson', sql: 'SELECT * FROM rep_suppressions ORDER BY epd, side, move_uci' },
    { file: 'rep_nodes.ndjson', sql: 'SELECT * FROM rep_nodes ORDER BY epd, side' },
    { file: 'rep_moves.ndjson', sql: 'SELECT * FROM rep_moves ORDER BY epd, side, move_uci' },
    { file: 'rep_provenance.ndjson', sql: 'SELECT * FROM rep_provenance ORDER BY id' },
  ];

  for (const { file, sql, transform } of TABLES) {
    let rows = db.prepare(sql).all();
    if (transform) rows = rows.map(transform);
    const content = sortedNdjson(rows, () => []); // already ordered by SQL ORDER BY
    writeFileSync(join(outputDir, file), content, 'utf8');
    manifestFiles.set(file, content);
    console.log(`  ${file}: ${rows.length} rows`);
  }

  // ── PGN export ────────────────────────────────────────────────────────────

  const games = db.prepare("SELECT * FROM games WHERE status = 'finished' ORDER BY id").all();
  const gameCount = games.length;
  const pgnManifestEntries = new Map();

  for (const game of games) {
    const moves = db.prepare(
      'SELECT ply, san FROM game_moves WHERE game_id = ? ORDER BY ply'
    ).all(game.id);

    // Find the book_version at game time — take the highest book_version from observations
    // for this game; null if none
    const bvRow = db.prepare(
      'SELECT MAX(book_version) AS bv FROM rep_observations WHERE game_id = ?'
    ).get(game.id);
    const bookVersion = bvRow?.bv ?? null;

    const pgn = buildPgn(moves, game, anonymise, bookVersion);
    const filename = `pgn/${game.id}.pgn`;
    writeFileSync(join(outputDir, filename), pgn, 'utf8');
    pgnManifestEntries.set(filename, pgn);
  }

  // Add PGN files to manifest (sorted by filename, which is by game id)
  for (const [name, content] of [...pgnManifestEntries.entries()].sort(([a], [b]) => a < b ? -1 : 1)) {
    manifestFiles.set(name, content);
  }
  console.log(`  pgn/: ${gameCount} games`);

  // ── Data dictionary ───────────────────────────────────────────────────────

  const dictPath = join(__dir, '../docs/research/repertoire-data-dictionary.md');
  let dictContent;
  try {
    dictContent = readFileSync(dictPath, 'utf8');
  } catch {
    dictContent = '# Repertoire research dataset — data dictionary\n\nSee docs/research/repertoire-data-dictionary.md\n';
  }
  writeFileSync(join(outputDir, 'data-dictionary.md'), dictContent, 'utf8');
  manifestFiles.set('data-dictionary.md', dictContent);

  // ── Manifest ──────────────────────────────────────────────────────────────

  const manifest = computeManifest(manifestFiles);
  writeFileSync(join(outputDir, 'manifest.sha256'), manifest, 'utf8');
  console.log(`  manifest.sha256: ${manifestFiles.size} files hashed`);

  // ── Sidecar (excluded from manifest) ─────────────────────────────────────

  const bookVersionRow = db.prepare('SELECT version FROM rep_book_version WHERE singleton = 0').get();
  const bookVersion = bookVersionRow?.version ?? 0;

  // exportedAt: use ISO string of current time — this is the ONE place wall-clock is permitted
  const sidecar = {
    exportedAt: new Date().toISOString(),
    bookVersion,
    gameCount,
    scriptVersion: '1',
  };
  writeFileSync(join(outputDir, 'sidecar.json'), JSON.stringify(sidecar, null, 2) + '\n', 'utf8');

  db.close();
  console.log(`\nExport complete → ${outputDir}`);
  console.log(`Book version: ${bookVersion} | Games: ${gameCount}`);
}

run();
