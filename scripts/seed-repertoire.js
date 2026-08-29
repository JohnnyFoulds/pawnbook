#!/usr/bin/env node
/**
 * Seed or rebuild the repertoire from finished, analysed games.
 * Usage:
 *   node scripts/seed-repertoire.js          — process games not yet in rep_observations
 *   node scripts/seed-repertoire.js --rebuild — drop rep_nodes+rep_moves, recompute projections
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { openDb, SqliteGameRepository, SqliteRepertoireRepository } from '../src/adapters/sqlite/repositories.js';
import { updateRepertoire } from '../src/api/ws/repertoire-service.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dir, '../data/chess.db');
const rebuild = process.argv.includes('--rebuild');

const db = openDb(dbPath);
const gameRepo = new SqliteGameRepository(db);
const repertoireRepo = new SqliteRepertoireRepository(db);

if (rebuild) {
  console.log('Rebuilding rep_nodes and rep_moves from observations...');
  db.exec('DELETE FROM rep_nodes; DELETE FROM rep_moves;');
}

const games = db.prepare(`
  SELECT id, player_color, result FROM games
  WHERE status = 'finished' AND analysis_state = 'done'
  ORDER BY played_at ASC
`).all();

let processed = 0;
for (const game of games) {
  if (!rebuild) {
    const existing = db.prepare('SELECT COUNT(*) as n FROM rep_observations WHERE game_id = ?').get(game.id);
    if (existing.n > 0) continue;
  }
  await updateRepertoire({
    gameId: game.id,
    playerColor: game.player_color,
    gameResult: game.result,
    gameRepo,
    repertoireRepo,
    ws: null,
  });
  processed++;
  if (processed % 10 === 0) console.log(`Processed ${processed}/${games.length} games...`);
}

console.log(`Done. Processed ${processed} games.`);
db.close();
