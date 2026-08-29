/**
 * Tests the Phase 23 puzzles schema migration: UNIQUE(fen) → UNIQUE(fen, kind)
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../../src/adapters/sqlite/schema.js';

describe('puzzles migration (Phase 23)', () => {
  it('migrates UNIQUE(fen) to UNIQUE(fen, kind) without losing rows', () => {
    const db = new Database(':memory:');

    // Create the OLD puzzles table with the original UNIQUE(fen) constraint
    db.exec(`
      CREATE TABLE games (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        opponent_id TEXT NOT NULL,
        player_color TEXT NOT NULL DEFAULT 'white',
        status TEXT NOT NULL DEFAULT 'in_progress',
        ranked INTEGER NOT NULL DEFAULT 1,
        analysis_state TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE TABLE puzzles (
        id TEXT PRIMARY KEY,
        fen TEXT NOT NULL UNIQUE,
        side_to_move TEXT NOT NULL,
        best_move_uci TEXT NOT NULL,
        best_move_san TEXT,
        pv TEXT,
        accepted_moves_json TEXT,
        followup_uci TEXT,
        played_move_uci TEXT,
        played_move_san TEXT,
        cp_loss REAL,
        win_loss_pts REAL,
        classification TEXT,
        findability REAL,
        temptation REAL,
        instructiveness REAL,
        tags TEXT,
        maia_model TEXT,
        policy_temperature REAL,
        elo_at_creation INTEGER,
        source_game_id TEXT REFERENCES games(id),
        source_ply INTEGER,
        phase TEXT,
        was_timed INTEGER NOT NULL DEFAULT 0,
        times_seen INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
    `);

    // Insert some existing rows
    db.exec(`
      INSERT INTO puzzles (id, fen, side_to_move, best_move_uci, created_at)
      VALUES
        ('p1', 'fen1 w - -', 'white', 'e2e4', 1000),
        ('p2', 'fen2 b - -', 'black', 'd7d5', 2000);
    `);

    // Apply schema (runs the migration)
    applySchema(db);

    // Verify rows were preserved
    const rows = db.prepare('SELECT id, fen FROM puzzles ORDER BY created_at').all();
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('p1');
    expect(rows[1].id).toBe('p2');

    // Verify UNIQUE(fen, kind) is now in effect — same fen but different kind is allowed
    expect(() => {
      db.exec(`INSERT INTO puzzles (id, kind, fen, side_to_move, best_move_uci, created_at)
               VALUES ('p3', 'opening', 'fen1 w - -', 'white', 'e2e4', 3000)`);
    }).not.toThrow();

    // Verify same (fen, kind) still conflicts
    expect(() => {
      db.exec(`INSERT INTO puzzles (id, kind, fen, side_to_move, best_move_uci, created_at)
               VALUES ('p4', 'tactical', 'fen1 w - -', 'white', 'e2e4', 4000)`);
    }).toThrow();

    // Kind column added with default 'tactical'
    const p1 = db.prepare("SELECT kind FROM puzzles WHERE id = 'p1'").get();
    expect(p1.kind).toBe('tactical');

    db.close();
  });

  it('is idempotent when already migrated', () => {
    const db = new Database(':memory:');
    // Apply schema twice on a clean DB — should not throw
    applySchema(db);
    expect(() => applySchema(db)).not.toThrow();
    db.close();
  });
});
