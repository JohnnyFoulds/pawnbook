#!/usr/bin/env node
/**
 * scripts/regrade.js — Phase 13 backfill
 *
 * Re-signs cp_white / mate_in in move_evals where the stored FEN has Black to
 * move, then re-derives win_before, win_after, cp_loss, win_loss_pts,
 * classification and move_accuracy from the corrected values, and finally
 * recomputes accuracy / opponent_accuracy on the games table.
 *
 * Engine-free: every value is derived from data already in the database.
 * Safe to run more than once: idempotent after the first successful run.
 *
 * Usage:
 *   node scripts/regrade.js [--db ./data/chess.db] [--dry-run]
 */

import Database from 'better-sqlite3';

import {
  winPct, classify, moveAccuracy, gameAccuracy,
} from '../src/domain/analysis/grade.js';

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

console.log(`regrade: opening ${DB_PATH}${DRY_RUN ? ' (DRY RUN — no writes)' : ''}`);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the side-to-move character ('w' or 'b') from a FEN string.
 * @param {string} fen
 * @returns {'w'|'b'}
 */
function sideToMove(fen) {
  return fen.split(' ')[1];
}

// ── Step 1: re-sign cp_white / mate_in ───────────────────────────────────────

const rows = db.prepare('SELECT rowid, game_id, ply, fen, cp_white, mate_in FROM move_evals').all();

console.log(`regrade: ${rows.length} move_eval rows`);

let resignCount = 0;
for (const row of rows) {
  if (sideToMove(row.fen) !== 'b') continue; // White to move: already correct

  const newCp   = row.cp_white == null   ? null : -row.cp_white;
  const newMate = row.mate_in  == null   ? null : -row.mate_in;

  if (newCp === row.cp_white && newMate === row.mate_in) continue; // already fixed

  if (!DRY_RUN) {
    db.prepare('UPDATE move_evals SET cp_white = ?, mate_in = ? WHERE game_id = ? AND ply = ?')
      .run(newCp, newMate, row.game_id, row.ply);
  }
  resignCount++;
}

console.log(`regrade: re-signed ${resignCount} rows`);

// ── Step 2: re-derive win_before/after, cp_loss, win_loss_pts, classification, accuracy ──

// Reload after re-signing so the derived pass reads updated values.
const allEvals = db.prepare(`
  SELECT game_id, ply, fen, mover, cp_white, mate_in
  FROM move_evals
  ORDER BY game_id, ply
`).all();

// Group by game_id so we can process each game's consecutive-ply pairs.
const byGame = new Map();
for (const row of allEvals) {
  if (!byGame.has(row.game_id)) byGame.set(row.game_id, []);
  byGame.get(row.game_id).push(row);
}

console.log(`regrade: re-deriving grades for ${byGame.size} games`);

let gradeCount = 0;
const gameAccuracies = new Map(); // gameId → { player: [], opponent: [] }

for (const [gameId, plies] of byGame) {
  // Sort by ply to ensure consecutive ordering
  plies.sort((a, b) => a.ply - b.ply);

  const playerAcc   = [];
  const opponentAcc = [];

  for (let i = 0; i < plies.length; i++) {
    const row  = plies[i];
    // "before" is this row; "after" is the next.  The last ply has no "after" so skip.
    if (i + 1 >= plies.length) continue;

    const after = plies[i + 1];

    const moverColor = row.ply % 2 === 1 ? 'white' : 'black';
    const cpBeforeWhite = (i === 0) ? 15 : (row.cp_white ?? 0);
    const cpAfterWhite  = after.cp_white ?? 0;

    const winBeforeWhite = winPct(cpBeforeWhite);
    const winAfterWhite  = winPct(cpAfterWhite);
    const winBefore = moverColor === 'white' ? winBeforeWhite : 100 - winBeforeWhite;
    const winAfter  = moverColor === 'white' ? winAfterWhite  : 100 - winAfterWhite;

    const winLoss = Math.max(0, winBefore - winAfter);
    const cpLoss  = moverColor === 'white'
      ? Math.max(0, cpBeforeWhite - cpAfterWhite)
      : Math.max(0, cpAfterWhite  - cpBeforeWhite);

    const hadForcedMate = moverColor === 'white'
      ? (row.mate_in != null && row.mate_in > 0)
      : (row.mate_in != null && row.mate_in < 0);
    const afterHasForcedMateForMover = moverColor === 'white'
      ? (after.mate_in != null && after.mate_in > 0)
      : (after.mate_in != null && after.mate_in < 0);
    const walkedIntoMate = moverColor === 'white'
      ? (after.mate_in != null && after.mate_in < 0)
      : (after.mate_in != null && after.mate_in > 0);
    const mateMissed = hadForcedMate && !afterHasForcedMateForMover;

    const { classification } = classify(winLoss, cpLoss, {
      wasMate: walkedIntoMate,
      mateMissed,
      cpBefore: cpBeforeWhite,
    });
    const accuracy = moveAccuracy(winBefore, winAfter);

    if (!DRY_RUN) {
      db.prepare(`
        UPDATE move_evals
        SET win_before = ?, win_after = ?, cp_loss = ?, win_loss_pts = ?,
            classification = ?, move_accuracy = ?
        WHERE game_id = ? AND ply = ?
      `).run(winBefore, winAfter, cpLoss, winLoss, classification, accuracy, gameId, row.ply);
    }
    gradeCount++;

    if (row.mover === 'player')   playerAcc.push(accuracy);
    else                          opponentAcc.push(accuracy);
  }

  gameAccuracies.set(gameId, { player: playerAcc, opponent: opponentAcc });
}

console.log(`regrade: re-graded ${gradeCount} plies`);

// ── Step 3: recompute game-level accuracy ─────────────────────────────────────

let gameCount = 0;
for (const [gameId, { player, opponent }] of gameAccuracies) {
  const acc    = gameAccuracy(player);
  const oppAcc = gameAccuracy(opponent);
  if (!DRY_RUN) {
    db.prepare('UPDATE games SET accuracy = ?, opponent_accuracy = ? WHERE id = ?')
      .run(acc || null, oppAcc || null, gameId);
  }
  gameCount++;
}

console.log(`regrade: updated ${gameCount} game accuracy rows`);
if (DRY_RUN) {
  console.log('regrade: DRY RUN complete — no changes written');
} else {
  console.log('regrade: done');
}
