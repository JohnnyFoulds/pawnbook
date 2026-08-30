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
  try { db.exec('ALTER TABLE move_evals ADD COLUMN win_loss_pts REAL'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE games ADD COLUMN strength_elo INTEGER'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE games ADD COLUMN opponent_strength_elo INTEGER'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE games ADD COLUMN coach_enabled INTEGER NOT NULL DEFAULT 1'); } catch { /* already exists */ }

  // Phase 29: extend rep_changelog.kind CHECK to include 'elect' and 'quarantine_exit'.
  // If the old constraint is in place, rebuild the table (safe: data/chess.db has 0 rows).
  const _clInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='rep_changelog'").get();
  if (_clInfo?.sql && !_clInfo.sql.includes('quarantine_exit')) {
    db.exec(`
      ALTER TABLE rep_changelog RENAME TO rep_changelog_old;
      CREATE TABLE rep_changelog (
        id            TEXT    PRIMARY KEY,
        at            INTEGER NOT NULL,
        epd           TEXT    NOT NULL,
        side          TEXT    NOT NULL CHECK(side IN ('white','black')),
        kind          TEXT    NOT NULL CHECK(kind IN (
                        'promote','retire','confirm','refuse','settle','reverse',
                        'elect','quarantine_exit')),
        from_uci      TEXT,
        to_uci        TEXT,
        challenge_id  TEXT    REFERENCES rep_challenges(id),
        rule          TEXT,
        detail_json   TEXT,
        provenance_id INTEGER NOT NULL REFERENCES rep_provenance(id),
        book_version  INTEGER NOT NULL
      );
      INSERT INTO rep_changelog SELECT * FROM rep_changelog_old;
      DROP TABLE rep_changelog_old;
      CREATE INDEX IF NOT EXISTS idx_rep_changelog_epd ON rep_changelog(epd, side);
    `);
  }

  // Phase 23: add kind column to puzzles and fix UNIQUE(fen) → UNIQUE(fen, kind)
  try { db.exec("ALTER TABLE puzzles ADD COLUMN kind TEXT NOT NULL DEFAULT 'tactical'"); } catch { /* already exists */ }
  const _puzzlesInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='puzzles'").get();
  if (_puzzlesInfo?.sql?.includes('fen TEXT NOT NULL UNIQUE') || _puzzlesInfo?.sql?.includes('"fen" TEXT NOT NULL UNIQUE')) {
    db.exec(`
      CREATE TABLE puzzles_new (
        id                   TEXT PRIMARY KEY,
        kind                 TEXT NOT NULL DEFAULT 'tactical',
        fen                  TEXT NOT NULL,
        side_to_move         TEXT NOT NULL,
        best_move_uci        TEXT NOT NULL,
        best_move_san        TEXT,
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
        created_at           INTEGER NOT NULL,
        UNIQUE(fen, kind)
      );
      INSERT INTO puzzles_new SELECT id, kind, fen, side_to_move, best_move_uci, best_move_san,
        pv, accepted_moves_json, followup_uci, played_move_uci, played_move_san, cp_loss,
        win_loss_pts, classification, findability, temptation, instructiveness, tags, maia_model,
        policy_temperature, elo_at_creation, source_game_id, source_ply, phase, was_timed,
        times_seen, created_at FROM puzzles;
      DROP TABLE puzzles;
      ALTER TABLE puzzles_new RENAME TO puzzles;
    `);
  }

  // make move_san nullable — original DDL had NOT NULL which silently dropped all rows via INSERT OR IGNORE
  const moveSanNotNull = db.prepare("PRAGMA table_info(move_evals)").all()
    .find(c => c.name === 'move_san')?.notnull === 1;
  if (moveSanNotNull) {
    db.exec(`
      ALTER TABLE move_evals RENAME TO move_evals_old;
      CREATE TABLE move_evals (
        game_id          TEXT NOT NULL REFERENCES games(id),
        ply              INTEGER NOT NULL,
        fen              TEXT NOT NULL,
        move_uci         TEXT NOT NULL,
        move_san         TEXT,
        cp_white         REAL,
        mate_in          INTEGER,
        best_move_uci    TEXT,
        pv               TEXT,
        mover            TEXT NOT NULL CHECK(mover IN ('player','opponent')),
        win_before       REAL,
        win_after        REAL,
        cp_loss          REAL,
        win_loss_pts     REAL,
        classification   TEXT,
        move_accuracy    REAL,
        alt_moves_json   TEXT,
        PRIMARY KEY (game_id, ply)
      );
      INSERT OR IGNORE INTO move_evals SELECT * FROM move_evals_old;
      DROP TABLE move_evals_old;
    `);
  }

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
      coach_enabled          INTEGER NOT NULL DEFAULT 1,
      time_control_initial_sec INTEGER,
      time_control_inc_sec   INTEGER,
      clock_white_ms         INTEGER,
      clock_black_ms         INTEGER,
      elo_before             INTEGER,
      elo_after              INTEGER,
      accuracy               REAL,
      opponent_accuracy      REAL,
      strength_elo           INTEGER,
      opponent_strength_elo  INTEGER,
      analysis_state         TEXT NOT NULL DEFAULT 'pending'
                               CHECK(analysis_state IN ('pending','running','done','failed')),
      analysis_error         TEXT,
      analysed_at            INTEGER
    );

    CREATE TABLE IF NOT EXISTS strength_samples (
      game_id       TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      side          TEXT NOT NULL CHECK (side IN ('player','opponent')),
      n             INTEGER NOT NULL,
      ase           REAL NOT NULL,
      sd            REAL NOT NULL,
      p75_loss      REAL,
      was_timed     INTEGER NOT NULL DEFAULT 0,
      coeff_version INTEGER NOT NULL,
      PRIMARY KEY (game_id, side)
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
      move_san         TEXT,
      cp_white         REAL,
      mate_in          INTEGER,
      best_move_uci    TEXT,
      pv               TEXT,
      mover            TEXT NOT NULL CHECK(mover IN ('player','opponent')),
      win_before       REAL,
      win_after        REAL,
      cp_loss          REAL,
      win_loss_pts     REAL,
      classification   TEXT,
      move_accuracy    REAL,
      alt_moves_json   TEXT,
      PRIMARY KEY (game_id, ply)
    );

    CREATE TABLE IF NOT EXISTS puzzles (
      id                   TEXT PRIMARY KEY,
      kind                 TEXT NOT NULL DEFAULT 'tactical',
      fen                  TEXT NOT NULL,
      side_to_move         TEXT NOT NULL,
      best_move_uci        TEXT NOT NULL,
      best_move_san        TEXT,
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
      created_at           INTEGER NOT NULL,
      UNIQUE(fen, kind)
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
      state           INTEGER,
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

    CREATE TABLE IF NOT EXISTS rep_book_version (
      singleton INTEGER PRIMARY KEY DEFAULT 0 CHECK(singleton = 0),
      version   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rep_provenance (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      at              INTEGER NOT NULL,
      schema_version  TEXT NOT NULL,
      balance_hash    TEXT NOT NULL,
      app_git_sha     TEXT,
      sf_version      TEXT,
      sf_depth        INTEGER,
      sf_multipv      INTEGER,
      maia_weights_id TEXT
    );

    CREATE TABLE IF NOT EXISTS rep_observations (
      game_id        TEXT    NOT NULL REFERENCES games(id),
      ply            INTEGER NOT NULL,
      epd            TEXT    NOT NULL,
      side           TEXT    NOT NULL CHECK(side IN ('white','black')),
      move_uci       TEXT    NOT NULL,
      move_san       TEXT,
      win_loss_pts   REAL,
      classification TEXT,
      played_at      INTEGER NOT NULL,
      source         TEXT    NOT NULL CHECK(source IN ('game','coach_kept','coach_corrected')),
      provenance_id  INTEGER NOT NULL REFERENCES rep_provenance(id),
      book_version   INTEGER NOT NULL,
      PRIMARY KEY (game_id, ply)
    );
    CREATE INDEX IF NOT EXISTS idx_rep_obs_epd ON rep_observations(epd, side);

    CREATE TABLE IF NOT EXISTS rep_deviations (
      id              TEXT    PRIMARY KEY,
      game_id         TEXT    NOT NULL REFERENCES games(id),
      ply             INTEGER NOT NULL,
      epd             TEXT    NOT NULL,
      kind            TEXT    NOT NULL CHECK(kind IN (
                        'refused_repeat','in_book_canonical','in_book_alt',
                        'transposition','new_territory','order_slip','lapse','novelty')),
      played_uci      TEXT    NOT NULL,
      book_uci        TEXT,
      resolution      TEXT    CHECK(resolution IN (
                        'alerted_corrected','alerted_kept','alerted_timeout','post_game')),
      decision_ms_taken INTEGER,
      provenance_id   INTEGER NOT NULL REFERENCES rep_provenance(id),
      book_version    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rep_dev_game ON rep_deviations(game_id);

    CREATE TABLE IF NOT EXISTS rep_audits (
      id            TEXT    PRIMARY KEY,
      epd           TEXT    NOT NULL,
      side          TEXT    NOT NULL CHECK(side IN ('white','black')),
      move_uci      TEXT    NOT NULL,
      depth         INTEGER NOT NULL,
      multipv       INTEGER NOT NULL,
      win_pct       REAL,
      cp            REAL,
      pv            TEXT,
      run_at        INTEGER NOT NULL,
      provenance_id INTEGER NOT NULL REFERENCES rep_provenance(id),
      book_version  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rep_audits_epd ON rep_audits(epd, side, move_uci);

    CREATE TABLE IF NOT EXISTS rep_challenges (
      id                    TEXT    PRIMARY KEY,
      epd                   TEXT    NOT NULL,
      side                  TEXT    NOT NULL CHECK(side IN ('white','black')),
      fen                   TEXT    NOT NULL,
      incumbent_uci         TEXT    NOT NULL,
      challenger_uci        TEXT    NOT NULL,
      opened_game_id        TEXT    NOT NULL REFERENCES games(id),
      opened_ply            INTEGER NOT NULL,
      opened_at             INTEGER NOT NULL,
      inc_observations      INTEGER,
      inc_mean_win_loss_pts REAL,
      inc_score_w           INTEGER,
      inc_score_d           INTEGER,
      inc_score_l           INTEGER,
      inc_card_state        TEXT,
      challenger_plays      INTEGER NOT NULL DEFAULT 0,
      incumbent_plays       INTEGER NOT NULL DEFAULT 0,
      encounters_since_open INTEGER NOT NULL DEFAULT 0,
      move_ms_taken         INTEGER,
      move_ms_zscore        REAL,
      decision_ms_taken     INTEGER,
      engine_delta_win_pts  REAL,
      engine_audit_id       TEXT    REFERENCES rep_audits(id),
      trend_challenger      REAL,
      trend_incumbent       REAL,
      result_challenger_perf REAL,
      result_challenger_n   INTEGER NOT NULL DEFAULT 0,
      result_incumbent_perf REAL,
      result_incumbent_n    INTEGER NOT NULL DEFAULT 0,
      status                TEXT    NOT NULL DEFAULT 'open'
                              CHECK(status IN ('open','promoted','rejected',
                                              'rejected_unsound','abandoned','settled_both')),
      resolution_rule       TEXT,
      resolved_at           INTEGER,
      resolved_by           TEXT    CHECK(resolved_by IN ('algorithm','user_override')),
      gate_reason           TEXT,
      provenance_id         INTEGER NOT NULL REFERENCES rep_provenance(id),
      book_version          INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rep_chal_epd ON rep_challenges(epd, side, status);

    CREATE TABLE IF NOT EXISTS rep_changelog (
      id            TEXT    PRIMARY KEY,
      at            INTEGER NOT NULL,
      epd           TEXT    NOT NULL,
      side          TEXT    NOT NULL CHECK(side IN ('white','black')),
      kind          TEXT    NOT NULL CHECK(kind IN (
                      'promote','retire','confirm','refuse','settle','reverse',
                      'elect','quarantine_exit')),
      from_uci      TEXT,
      to_uci        TEXT,
      challenge_id  TEXT    REFERENCES rep_challenges(id),
      rule          TEXT,
      detail_json   TEXT,
      provenance_id INTEGER NOT NULL REFERENCES rep_provenance(id),
      book_version  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rep_changelog_epd ON rep_changelog(epd, side);

    CREATE TABLE IF NOT EXISTS rep_suppressions (
      epd           TEXT    NOT NULL,
      side          TEXT    NOT NULL CHECK(side IN ('white','black')),
      move_uci      TEXT    NOT NULL,
      until_encounters INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      changelog_id  TEXT    REFERENCES rep_changelog(id),
      PRIMARY KEY (epd, side, move_uci)
    );

    CREATE TABLE IF NOT EXISTS rep_nodes (
      epd                         TEXT    NOT NULL,
      side                        TEXT    NOT NULL CHECK(side IN ('white','black')),
      fen                         TEXT,
      first_seen                  INTEGER,
      last_seen                   INTEGER,
      times_reached               INTEGER NOT NULL DEFAULT 0,
      encounters                  INTEGER NOT NULL DEFAULT 0,
      min_ply                     INTEGER,
      reach_prob                  REAL,
      reach_stale                 INTEGER NOT NULL DEFAULT 1,
      line_loss                   REAL,
      vote_frozen_until_encounter INTEGER,
      PRIMARY KEY (epd, side)
    );

    CREATE TABLE IF NOT EXISTS rep_moves (
      epd               TEXT    NOT NULL,
      side              TEXT    NOT NULL CHECK(side IN ('white','black')),
      move_uci          TEXT    NOT NULL,
      move_san          TEXT,
      role              TEXT    NOT NULL CHECK(role IN (
                          'candidate','canonical','alt','challenger',
                          'quarantined','refused','retired')),
      observations      INTEGER NOT NULL DEFAULT 0,
      weighted_score    REAL,
      mean_win_loss_pts REAL,
      worst_win_loss_pts REAL,
      audit_id          TEXT    REFERENCES rep_audits(id),
      gate_reason       TEXT,
      score_w           INTEGER NOT NULL DEFAULT 0,
      score_d           INTEGER NOT NULL DEFAULT 0,
      score_l           INTEGER NOT NULL DEFAULT 0,
      first_played      INTEGER,
      last_played       INTEGER,
      PRIMARY KEY (epd, side, move_uci)
    );

    CREATE TABLE IF NOT EXISTS rep_policy (
      epd             TEXT    NOT NULL,
      maia_model      TEXT    NOT NULL,
      maia_weights_id TEXT    NOT NULL,
      policy_json     TEXT    NOT NULL,
      computed_at     INTEGER NOT NULL,
      PRIMARY KEY (epd, maia_model, maia_weights_id)
    );
  `);

  db.prepare('INSERT OR IGNORE INTO rep_book_version (singleton, version) VALUES (0, 0)').run();
}
