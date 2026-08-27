/**
 * @module adapters/sqlite/schema
 * Idempotent DDL — safe to run on every startup.
 */

/** @param {import('better-sqlite3').Database} db */
export function applySchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  // Idempotent migrations for columns added after initial schema creation.
  try { db.exec('ALTER TABLE games ADD COLUMN analysis_error TEXT'); } catch { /* already exists */ }

  db.exec(`

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS games (
      id                     TEXT PRIMARY KEY,
      started_at             INTEGER NOT NULL,
      played_at              INTEGER,
      opponent_id            TEXT NOT NULL,
      opponent_elo           INTEGER,
      player_color           TEXT NOT NULL CHECK(player_color IN ('white','black')),
      status                 TEXT NOT NULL DEFAULT 'in_progress'
                               CHECK(status IN ('in_progress','finished','abandoned')),
      result                 TEXT CHECK(result IN ('win','loss','draw')),
      termination            TEXT CHECK(termination IN (
                               'checkmate','resignation','stalemate','threefold',
                               'fifty_move','insufficient_material','timeout','abandoned')),
      pgn                    TEXT,
      ranked                 INTEGER NOT NULL DEFAULT 1,
      time_control_initial_sec INTEGER,
      time_control_inc_sec   INTEGER,
      clock_white_ms         INTEGER,
      clock_black_ms         INTEGER,
      elo_before             INTEGER,
      elo_after              INTEGER,
      accuracy               REAL,
      opponent_accuracy      REAL,
      analysis_state         TEXT NOT NULL DEFAULT 'pending'
                               CHECK(analysis_state IN ('pending','running','done','failed')),
      analysis_error         TEXT,
      analysed_at            INTEGER
    );

    CREATE TABLE IF NOT EXISTS game_moves (
      game_id  TEXT NOT NULL REFERENCES games(id),
      ply      INTEGER NOT NULL,
      uci      TEXT NOT NULL,
      san      TEXT NOT NULL,
      ms_taken INTEGER,
      PRIMARY KEY (game_id, ply)
    );

    CREATE TABLE IF NOT EXISTS move_evals (
      game_id          TEXT NOT NULL REFERENCES games(id),
      ply              INTEGER NOT NULL,
      fen              TEXT NOT NULL,
      move_uci         TEXT NOT NULL,
      move_san         TEXT NOT NULL,
      cp_white         REAL,
      mate_in          INTEGER,
      best_move_uci    TEXT,
      pv               TEXT,
      mover            TEXT NOT NULL CHECK(mover IN ('player','opponent')),
      win_before       REAL,
      win_after        REAL,
      cp_loss          REAL,
      classification   TEXT,
      move_accuracy    REAL,
      alt_moves_json   TEXT,
      PRIMARY KEY (game_id, ply)
    );

    CREATE TABLE IF NOT EXISTS puzzles (
      id                   TEXT PRIMARY KEY,
      fen                  TEXT NOT NULL UNIQUE,
      side_to_move         TEXT NOT NULL,
      best_move_uci        TEXT NOT NULL,
      best_move_san        TEXT NOT NULL,
      pv                   TEXT,
      accepted_moves_json  TEXT,
      followup_uci         TEXT,
      played_move_uci      TEXT,
      played_move_san      TEXT,
      cp_loss              REAL,
      win_loss_pts         REAL,
      classification       TEXT,
      findability          REAL,
      temptation           REAL,
      instructiveness      REAL,
      tags                 TEXT,
      maia_model           TEXT,
      policy_temperature   REAL,
      elo_at_creation      INTEGER,
      source_game_id       TEXT REFERENCES games(id),
      source_ply           INTEGER,
      phase                TEXT,
      was_timed            INTEGER NOT NULL DEFAULT 0,
      times_seen           INTEGER NOT NULL DEFAULT 1,
      created_at           INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fsrs_cards (
      puzzle_id       TEXT PRIMARY KEY REFERENCES puzzles(id),
      due             INTEGER NOT NULL,
      stability       REAL,
      difficulty      REAL,
      elapsed_days    INTEGER,
      scheduled_days  INTEGER,
      reps            INTEGER NOT NULL DEFAULT 0,
      lapses          INTEGER NOT NULL DEFAULT 0,
      state           TEXT,
      last_review     INTEGER,
      graduated       INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id                 TEXT PRIMARY KEY,
      puzzle_id          TEXT NOT NULL REFERENCES puzzles(id),
      reviewed_at        INTEGER NOT NULL,
      correct            INTEGER,
      rating             TEXT,
      ms_taken           INTEGER,
      attempted_move_uci TEXT,
      interval_before    INTEGER,
      interval_after     INTEGER,
      attempt_no         INTEGER NOT NULL DEFAULT 1,
      followup_correct   INTEGER,
      practice           INTEGER NOT NULL DEFAULT 0,
      suspect_recall     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS elo_history (
      id          TEXT PRIMARY KEY,
      recorded_at INTEGER NOT NULL,
      elo         INTEGER NOT NULL,
      game_id     TEXT REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS activity (
      day     TEXT PRIMARY KEY,
      games   INTEGER NOT NULL DEFAULT 0,
      reviews INTEGER NOT NULL DEFAULT 0
    );
  `);
}
