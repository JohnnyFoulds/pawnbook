/**
 * Tests the activity backfill migration: existing reviews/games → activity table.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

import { applySchema } from '../../src/adapters/sqlite/schema.js';
import { SqliteGameRepository } from '../../src/adapters/sqlite/repositories.js';

describe('activity backfill migration', () => {
  it('backfills review activity from existing reviews rows', () => {
    const db = new Database(':memory:');
    applySchema(db);

    // Insert a game (needed for FK in puzzles)
    db.prepare(`INSERT INTO games (id, started_at, opponent_id, player_color, status, ranked, analysis_state)
      VALUES ('g1', 1700000000000, 'maia-1100', 'white', 'finished', 1, 'done')`).run();

    // Insert a puzzle
    db.prepare(`INSERT INTO puzzles (id, kind, fen, side_to_move, best_move_uci, created_at)
      VALUES ('p1', 'tactical', 'rnbqkbnr/8/8/8/8/8/8/RNBQKBNR w - - 0 1', 'white', 'e2e4', 1700000000000)`).run();

    // Insert a review at a known time (2026-08-15 10:00 UTC → day key "2026-08-15")
    const reviewedAt = new Date('2026-08-15T10:00:00Z').getTime();
    db.prepare(`INSERT INTO reviews (id, puzzle_id, reviewed_at, correct, attempt_no, practice, suspect_recall)
      VALUES ('r1', 'p1', ?, 1, 1, 0, 0)`).run(reviewedAt);

    // Run migration (second applySchema = would be on restart after upgrade)
    applySchema(db);

    const row = db.prepare("SELECT * FROM activity WHERE day = '2026-08-15'").get();
    expect(row).not.toBeNull();
    expect(row.reviews).toBe(1);
  });

  it('backfills game activity from existing finished games', () => {
    const db = new Database(':memory:');
    applySchema(db);

    const playedAt = new Date('2026-08-20T12:00:00Z').getTime();
    db.prepare(`INSERT INTO games (id, started_at, played_at, opponent_id, player_color, status, ranked, analysis_state)
      VALUES ('g2', ?, ?, 'maia-1100', 'white', 'finished', 1, 'done')`).run(playedAt, playedAt);

    applySchema(db);

    const row = db.prepare("SELECT * FROM activity WHERE day = '2026-08-20'").get();
    expect(row).not.toBeNull();
    expect(row.games).toBe(1);
  });

  it('is idempotent — running applySchema twice does not double-count', () => {
    const db = new Database(':memory:');
    applySchema(db);

    const playedAt = new Date('2026-08-21T12:00:00Z').getTime();
    db.prepare(`INSERT INTO games (id, started_at, played_at, opponent_id, player_color, status, ranked, analysis_state)
      VALUES ('g3', ?, ?, 'maia-1100', 'white', 'finished', 1, 'done')`).run(playedAt, playedAt);

    applySchema(db); // first run backfills
    applySchema(db); // second run should not double-count

    const row = db.prepare("SELECT * FROM activity WHERE day = '2026-08-21'").get();
    expect(row.games).toBe(1);
  });

  it('getStreak works correctly after backfill', () => {
    const db = new Database(':memory:');
    applySchema(db);

    // Simulate two consecutive days of reviews
    const day1 = new Date('2026-08-30T10:00:00Z').getTime();
    const day2 = new Date('2026-08-31T10:00:00Z').getTime();

    db.prepare(`INSERT INTO games (id, started_at, opponent_id, player_color, status, ranked, analysis_state)
      VALUES ('g4', ?, 'maia-1100', 'white', 'finished', 1, 'done')`).run(day1);
    db.prepare(`INSERT INTO puzzles (id, kind, fen, side_to_move, best_move_uci, created_at)
      VALUES ('p2', 'tactical', 'rnbqkbnr/8/8/8/8/8/8/RNBQKBNR w - - 0 1', 'white', 'e2e4', ?)`).run(day1);

    db.prepare(`INSERT INTO reviews (id, puzzle_id, reviewed_at, correct, attempt_no, practice, suspect_recall)
      VALUES ('r2', 'p2', ?, 1, 1, 0, 0)`).run(day1);
    db.prepare(`INSERT INTO reviews (id, puzzle_id, reviewed_at, correct, attempt_no, practice, suspect_recall)
      VALUES ('r3', 'p2', ?, 1, 1, 0, 0)`).run(day2);

    applySchema(db);

    const repo = new SqliteGameRepository(db);
    expect(repo.getStreak(day2)).toBe(2);
  });
});
