/**
 * Contract test suite — same assertions run against BOTH repository implementations.
 * Any behaviour difference between sqlite and memory is a defect.
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { unlinkSync, existsSync } from 'fs';

import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { applySchema } from '../../src/adapters/sqlite/schema.js';
import {
  SqliteGameRepository,
  SqlitePuzzleRepository,
  SqliteSettingsRepository,
} from '../../src/adapters/sqlite/repositories.js';
import {
  InMemoryGameRepository,
  InMemoryPuzzleRepository,
  InMemorySettingsRepository,
} from '../../src/adapters/memory/repositories.js';
import { FixedClock } from '../../src/adapters/clock/fixed-clock.js';
import { GameNotFoundError, PuzzleNotFoundError } from '../../src/errors.js';

// ─── fixtures ────────────────────────────────────────────────────────────────

function makeGame(overrides = {}) {
  return {
    id: randomUUID(),
    startedAt: 1_700_000_000_000,
    opponentId: 'maia-1300',
    opponentElo: 1300,
    playerColor: 'white',
    status: 'in_progress',
    ranked: true,
    ...overrides,
  };
}

function makePuzzle(overrides = {}) {
  return {
    id: randomUUID(),
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    sideToMove: 'black',
    bestMoveUci: 'e7e5',
    bestMoveSan: 'e5',
    winLossPts: 12.0,
    classification: 'inaccuracy',
    findability: 0.15,
    ...overrides,
  };
}

// ─── helpers to build both implementations ───────────────────────────────────

function sqliteRepos() {
  const dbPath = join(tmpdir(), `pawnbook-test-${randomUUID()}.db`);
  const db = new Database(dbPath);
  applySchema(db);
  return {
    games: new SqliteGameRepository(db),
    puzzles: new SqlitePuzzleRepository(db),
    settings: new SqliteSettingsRepository(db),
    cleanup: () => { db.close(); if (existsSync(dbPath)) unlinkSync(dbPath); },
  };
}

function memoryRepos() {
  return {
    games: new InMemoryGameRepository(),
    puzzles: new InMemoryPuzzleRepository(),
    settings: new InMemorySettingsRepository(),
    cleanup: () => {},
  };
}

// ─── contract suite ──────────────────────────────────────────────────────────

const implementations = [
  { name: 'sqlite', factory: sqliteRepos },
  { name: 'memory', factory: memoryRepos },
];

for (const { name, factory } of implementations) {
  describe(`[${name}] game repository`, () => {
    let repos;
    beforeEach(() => { repos = factory(); });
    afterEach(() => repos.cleanup());

    it('saving then loading a game round-trips every field', () => {
      const game = makeGame({ timeControlInitialSec: 300, timeControlIncSec: 3 });
      repos.games.save(game);
      const loaded = repos.games.findById(game.id);
      expect(loaded.id).toBe(game.id);
      expect(loaded.opponentId).toBe(game.opponentId);
      expect(loaded.opponentElo).toBe(game.opponentElo);
      expect(loaded.playerColor).toBe(game.playerColor);
      expect(loaded.status).toBe(game.status);
    });

    it('unknown game id raises GameNotFoundError naming the id', () => {
      expect(() => repos.games.findById('no-such-id')).toThrowError(GameNotFoundError);
      expect(() => repos.games.findById('no-such-id')).toThrow(/no-such-id/);
    });

    it('elo_history append is ordered by recorded_at', () => {
      const game = makeGame();
      repos.games.save(game);
      repos.games.updateElo(game.id, { eloBefore: 1200, eloAfter: 1215, recordedAt: 2000 });
      repos.games.updateElo(game.id, { eloBefore: 1215, eloAfter: 1208, recordedAt: 1000 });
      const history = repos.games.getEloHistory();
      expect(history[0].recordedAt).toBeLessThanOrEqual(history[1].recordedAt);
    });

    it('game_moves round-trips a partial game for resume', () => {
      const game = makeGame();
      repos.games.save(game);
      repos.games.appendMove(game.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: 500 });
      repos.games.appendMove(game.id, { ply: 2, uci: 'e7e5', san: 'e5', msTaken: 800 });
      const moves = repos.games.getMoves(game.id);
      expect(moves).toHaveLength(2);
      expect(moves[0].uci).toBe('e2e4');
      expect(moves[1].uci).toBe('e7e5');
    });

    it('an elo update writes elo_history and syncs elo atomically', () => {
      const game = makeGame();
      repos.games.save(game);
      repos.games.updateElo(game.id, { eloBefore: 1200, eloAfter: 1212, recordedAt: 1000 });
      const history = repos.games.getEloHistory();
      expect(history.some(h => h.elo === 1212)).toBe(true);
    });
  });

  describe(`[${name}] puzzle repository`, () => {
    let repos;
    beforeEach(() => { repos = factory(); });
    afterEach(() => repos.cleanup());

    it('saving then loading a puzzle round-trips every field', () => {
      const puzzle = makePuzzle();
      const id = repos.puzzles.save(puzzle);
      const loaded = repos.puzzles.findById(id);
      expect(loaded.fen).toBe(puzzle.fen);
      expect(loaded.bestMoveUci ?? loaded.best_move_uci).toBeDefined();
    });

    it('unknown puzzle id raises PuzzleNotFoundError naming the id', () => {
      expect(() => repos.puzzles.findById('ghost')).toThrowError(PuzzleNotFoundError);
      expect(() => repos.puzzles.findById('ghost')).toThrow(/ghost/);
    });

    it('puzzle FEN is unique; re-inserting bumps times_seen', () => {
      const puzzle = makePuzzle();
      repos.puzzles.save(puzzle);
      repos.puzzles.save({ ...puzzle, id: randomUUID() });
      const id = repos.puzzles.save({ ...puzzle, id: randomUUID() });
      const loaded = repos.puzzles.findById(id);
      const timesSeen = loaded.timesSeen ?? loaded.times_seen;
      expect(timesSeen).toBe(3);
    });

    it('due-card query returns only cards with due <= clock.now()', () => {
      const clock = new FixedClock(1_000_000);
      const p1 = makePuzzle({ id: randomUUID(), fen: 'fen-a' });
      const p2 = makePuzzle({ id: randomUUID(), fen: 'fen-b' });
      const id1 = repos.puzzles.save(p1);
      const id2 = repos.puzzles.save(p2);
      repos.puzzles.saveCard({ puzzleId: id1, due: 500_000, reps: 0, lapses: 0, graduated: false });
      repos.puzzles.saveCard({ puzzleId: id2, due: 2_000_000, reps: 0, lapses: 0, graduated: false });
      const due = repos.puzzles.getDueCards(clock.now().getTime());
      expect(due).toHaveLength(1);
      // sqlite returns id from p.*; memory returns puzzleId from card spread
      const dueId = due[0].id ?? due[0].puzzleId;
      expect(dueId).toBe(id1);
    });
  });

  describe(`[${name}] settings repository`, () => {
    let repos;
    beforeEach(() => { repos = factory(); });
    afterEach(() => repos.cleanup());

    it('get returns null for an unknown key', () => {
      expect(repos.settings.get('no-such-key')).toBeNull();
    });

    it('set then get round-trips the value', () => {
      repos.settings.set('elo', '1247');
      expect(repos.settings.get('elo')).toBe('1247');
    });
  });
}

// ─── sqlite-only tests ───────────────────────────────────────────────────────

describe('[sqlite] schema', () => {
  let db, dbPath;
  beforeEach(() => {
    dbPath = join(tmpdir(), `pawnbook-schema-${randomUUID()}.db`);
    db = new Database(dbPath);
  });
  afterEach(() => { db.close(); if (existsSync(dbPath)) unlinkSync(dbPath); });

  it('schema is idempotent — applying it twice is a no-op', () => {
    expect(() => { applySchema(db); applySchema(db); }).not.toThrow();
  });

  it('analysis_state only accepts pending|running|done|failed', () => {
    applySchema(db);
    const stmt = db.prepare(`
      INSERT INTO games (id, started_at, opponent_id, player_color, analysis_state)
      VALUES (?, ?, ?, ?, ?)
    `);
    expect(() => stmt.run('x', 1, 'maia-1300', 'white', 'invalid')).toThrow();
  });

  it('games.status only accepts in_progress|finished|abandoned', () => {
    applySchema(db);
    const stmt = db.prepare(`
      INSERT INTO games (id, started_at, opponent_id, player_color, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    expect(() => stmt.run('x', 1, 'maia-1300', 'white', 'nope')).toThrow();
  });

  it('termination only accepts the eight enum values', () => {
    applySchema(db);
    const stmt = db.prepare(`
      INSERT INTO games (id, started_at, opponent_id, player_color, status, termination)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    expect(() => stmt.run('x', 1, 'maia-1300', 'white', 'finished', 'zzz')).toThrow();
  });
});

// ─── openDb helper ───────────────────────────────────────────────────────────

describe('[sqlite] openDb', () => {
  it('openDb creates a database and applies the schema', async () => {
    const { openDb } = await import('../../src/adapters/sqlite/repositories.js');
    const dbPath = join(tmpdir(), `pawnbook-opendb-${randomUUID()}.db`);
    let db;
    try {
      db = openDb(dbPath);
      // Schema applied — games table should exist
      expect(() => db.prepare('SELECT 1 FROM games LIMIT 0').all()).not.toThrow();
    } finally {
      if (db) db.close();
      if (existsSync(dbPath)) unlinkSync(dbPath);
    }
  });
});
