/**
 * @module adapters/sqlite/repositories
 * SQLite implementations of GameRepository, PuzzleRepository, SettingsRepository.
 */

import { randomUUID } from 'crypto';

import Database from 'better-sqlite3';

import { GameNotFoundError, PuzzleNotFoundError } from '../../errors.js';

import { applySchema } from './schema.js';

// ─── activity helpers ─────────────────────────────────────────────────────────

function _activityDayKey(timestampMs) {
  const d = new Date(timestampMs);
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _prevDay(dayKey) {
  const d = new Date(dayKey + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _deriveStreak(sortedDaysDesc, todayKey) {
  const daySet = new Set(sortedDaysDesc);
  const yesterdayKey = _prevDay(todayKey);
  let current = daySet.has(todayKey) ? todayKey : (daySet.has(yesterdayKey) ? yesterdayKey : null);
  if (!current) return 0;
  let streak = 0;
  while (daySet.has(current)) {
    streak++;
    current = _prevDay(current);
  }
  return streak;
}


/**
 * @param {string} dbPath
 * @returns {import('better-sqlite3').Database}
 */
export function openDb(dbPath) {
  const db = new Database(dbPath);
  applySchema(db);
  return db;
}

export class SqliteGameRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this._db = db;
  }

  /** @param {object} game */
  save(game) {
    const stmt = this._db.prepare(`
      INSERT INTO games (
        id, started_at, opponent_id, opponent_elo, player_color,
        status, ranked, coach_enabled, time_control_initial_sec, time_control_inc_sec,
        clock_white_ms, clock_black_ms,
        result, termination, pgn, played_at,
        elo_before, elo_after, accuracy, opponent_accuracy,
        analysis_state, analysis_error, analysed_at
      ) VALUES (
        @id, @started_at, @opponent_id, @opponent_elo, @player_color,
        @status, @ranked, @coach_enabled, @time_control_initial_sec, @time_control_inc_sec,
        @clock_white_ms, @clock_black_ms,
        @result, @termination, @pgn, @played_at,
        @elo_before, @elo_after, @accuracy, @opponent_accuracy,
        @analysis_state, @analysis_error, @analysed_at
      )
      ON CONFLICT(id) DO UPDATE SET
        status           = excluded.status,
        result           = excluded.result,
        termination      = excluded.termination,
        pgn              = excluded.pgn,
        played_at        = excluded.played_at,
        clock_white_ms   = excluded.clock_white_ms,
        clock_black_ms   = excluded.clock_black_ms,
        elo_before       = excluded.elo_before,
        elo_after        = excluded.elo_after,
        accuracy         = excluded.accuracy,
        opponent_accuracy= excluded.opponent_accuracy,
        analysis_state   = excluded.analysis_state,
        analysis_error   = excluded.analysis_error,
        analysed_at      = excluded.analysed_at
    `);
    stmt.run({
      id: game.id ?? randomUUID(),
      started_at: game.startedAt ?? Date.now(),
      opponent_id: game.opponentId,
      opponent_elo: game.opponentElo ?? null,
      player_color: game.playerColor,
      status: game.status ?? 'in_progress',
      ranked: game.ranked ? 1 : 0,
      coach_enabled: game.coachEnabled === false ? 0 : 1,
      time_control_initial_sec: game.timeControlInitialSec ?? null,
      time_control_inc_sec: game.timeControlIncSec ?? null,
      clock_white_ms: game.clockWhiteMs ?? null,
      clock_black_ms: game.clockBlackMs ?? null,
      result: game.result ?? null,
      termination: game.termination ?? null,
      pgn: game.pgn ?? null,
      played_at: game.playedAt ?? null,
      elo_before: game.eloBefore ?? null,
      elo_after: game.eloAfter ?? null,
      accuracy: game.accuracy ?? null,
      opponent_accuracy: game.opponentAccuracy ?? null,
      analysis_state: game.analysisState ?? 'pending',
      analysis_error: game.analysisError ?? null,
      analysed_at: game.analysedAt ?? null,
    });
  }

  /** @param {string} id @returns {object} */
  findById(id) {
    const row = this._db.prepare('SELECT * FROM games WHERE id = ?').get(id);
    if (!row) throw new GameNotFoundError(`Game '${id}' not found`);
    return this._rowToGame(row);
  }

  /** @param {string} gameId @param {object} move */
  appendMove(gameId, move) {
    this._db.prepare(`
      INSERT INTO game_moves (game_id, ply, uci, san, ms_taken)
      VALUES (?, ?, ?, ?, ?)
    `).run(gameId, move.ply, move.uci, move.san, move.msTaken ?? null);
  }

  /** @param {string} gameId @returns {object[]} */
  getMoves(gameId) {
    return this._db.prepare(
      'SELECT * FROM game_moves WHERE game_id = ? ORDER BY ply'
    ).all(gameId);
  }

  abandonAllInProgress() {
    this._db.prepare("UPDATE games SET status='abandoned' WHERE status='in_progress'").run();
  }

  /** Reset any analysis that was 'running' when the server last died. */
  resetRunningAnalyses() {
    this._db.prepare(
      "UPDATE games SET analysis_state='failed', analysis_error='Server restarted during analysis' WHERE analysis_state='running'"
    ).run();
  }

  /**
   * Persist live clock remainder after a move.
   * @param {string} gameId
   * @param {number} whiteMs
   * @param {number} blackMs
   */
  updateClock(gameId, whiteMs, blackMs) {
    this._db.prepare(
      'UPDATE games SET clock_white_ms = ?, clock_black_ms = ? WHERE id = ?'
    ).run(whiteMs, blackMs, gameId);
  }

  /** @param {string} gameId @param {object} opts */
  updateElo(gameId, { eloBefore, eloAfter, historyId, recordedAt }) {
    const updateGame = this._db.prepare(
      'UPDATE games SET elo_before = ?, elo_after = ? WHERE id = ?'
    );
    const insertHistory = this._db.prepare(`
      INSERT INTO elo_history (id, recorded_at, elo, game_id) VALUES (?, ?, ?, ?)
    `);
    const insertOrUpdateSettings = this._db.prepare(`
      INSERT INTO settings (key, value) VALUES ('elo', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    this._db.transaction(() => {
      updateGame.run(eloBefore, eloAfter, gameId);
      insertHistory.run(historyId ?? randomUUID(), recordedAt ?? Date.now(), eloAfter, gameId);
      insertOrUpdateSettings.run(String(eloAfter));
    })();
  }

  /** @returns {object[]} */
  getEloHistory() {
    return this._db.prepare('SELECT * FROM elo_history ORDER BY recorded_at ASC').all()
      .map(r => ({ id: r.id, recordedAt: r.recorded_at, elo: r.elo, gameId: r.game_id }));
  }

  /**
   * @param {number} limit
   * @returns {object[]}
   */
  listRecent(limit = 50) {
    return this._db.prepare(
      'SELECT * FROM games ORDER BY started_at DESC LIMIT ?'
    ).all(limit).map(r => this._rowToGame(r));
  }

  /**
   * @param {string} gameId
   * @returns {object[]}
   */
  getEvals(gameId) {
    return this._db.prepare(
      'SELECT * FROM move_evals WHERE game_id = ? ORDER BY ply'
    ).all(gameId);
  }

  /** @returns {Array<{classification: string, played_at: number}>} player-mover classified moves */
  getPlayerMoveClassifications() {
    return this._db.prepare(`
      SELECT me.classification, g.played_at
      FROM move_evals me
      JOIN games g ON g.id = me.game_id
      WHERE g.status = 'finished' AND me.mover = 'player' AND me.classification IS NOT NULL
      ORDER BY g.played_at ASC
    `).all();
  }

  /**
   * Save a partial eval row during incremental pre-evaluation (does not overwrite complete rows).
   * @param {string} gameId
   * @param {number} ply
   * @param {string} fen
   * @param {{cp: number|null, mate: number|null, bestmove: string, pv: string}} evalData
   */
  savePreEval(gameId, ply, fen, evalData) {
    this._db.prepare(`
      INSERT OR IGNORE INTO move_evals (game_id, ply, fen, cp_white, mate_in, best_move_uci, pv)
      VALUES (@game_id, @ply, @fen, @cp_white, @mate_in, @best_move_uci, @pv)
    `).run({
      game_id: gameId,
      ply,
      fen,
      cp_white: evalData.cp ?? null,
      mate_in: evalData.mate ?? null,
      best_move_uci: evalData.bestmove ?? null,
      pv: evalData.pv ?? null,
    });
  }

  /** @param {object} eval_ */
  saveMoveEval(eval_) {
    this._db.prepare(`
      INSERT OR REPLACE INTO move_evals (
        game_id, ply, fen, move_uci, move_san, cp_white, mate_in,
        best_move_uci, pv, mover, win_before, win_after, cp_loss,
        win_loss_pts, classification, move_accuracy, alt_moves_json
      ) VALUES (
        @game_id, @ply, @fen, @move_uci, @move_san, @cp_white, @mate_in,
        @best_move_uci, @pv, @mover, @win_before, @win_after, @cp_loss,
        @win_loss_pts, @classification, @move_accuracy, @alt_moves_json
      )
    `).run({
      game_id: eval_.gameId,
      ply: eval_.ply,
      fen: eval_.fen,
      move_uci: eval_.moveUci,
      move_san: eval_.moveSan ?? null,
      cp_white: eval_.cpWhite ?? null,
      mate_in: eval_.mateIn ?? null,
      best_move_uci: eval_.bestMoveUci ?? null,
      pv: eval_.pv ?? null,
      mover: eval_.mover,
      win_before: eval_.winBefore,
      win_after: eval_.winAfter,
      cp_loss: eval_.cpLoss ?? null,
      win_loss_pts: eval_.winLoss,
      classification: eval_.classification,
      move_accuracy: eval_.moveAccuracy ?? null,
      alt_moves_json: eval_.altMovesJson ?? null,
    });
  }

  _rowToGame(row) {
    return {
      id: row.id,
      startedAt: row.started_at,
      playedAt: row.played_at,
      opponentId: row.opponent_id,
      opponentElo: row.opponent_elo,
      playerColor: row.player_color,
      status: row.status,
      result: row.result,
      termination: row.termination,
      pgn: row.pgn,
      ranked: row.ranked === 1,
      coachEnabled: row.coach_enabled !== 0,
      timeControlInitialSec: row.time_control_initial_sec,
      timeControlIncSec: row.time_control_inc_sec,
      clockWhiteMs: row.clock_white_ms,
      clockBlackMs: row.clock_black_ms,
      eloBefore: row.elo_before,
      eloAfter: row.elo_after,
      accuracy: row.accuracy,
      opponentAccuracy: row.opponent_accuracy,
      analysisState: row.analysis_state,
      analysisError: row.analysis_error ?? null,
      analysedAt: row.analysed_at,
    };
  }

  /**
   * Record a game or review action for the given timestamp.
   * Uses a 04:00 local-time day boundary (activity before 4am belongs to the previous day).
   * @param {number} timestampMs
   * @param {'game'|'review'} type
   */
  recordActivity(timestampMs, type) {
    const day = _activityDayKey(timestampMs);
    this._db.prepare(`
      INSERT INTO activity (day, games, reviews) VALUES (@day, @g, @r)
      ON CONFLICT(day) DO UPDATE SET
        games   = games   + excluded.games,
        reviews = reviews + excluded.reviews
    `).run({ day, g: type === 'game' ? 1 : 0, r: type === 'review' ? 1 : 0 });
  }

  /**
   * Derive the current streak from activity rows.
   * Streak = consecutive days ending on today-or-yesterday with at least one activity.
   * @param {number} todayTimestampMs
   * @returns {number}
   */
  getStreak(todayTimestampMs) {
    const rows = this._db.prepare('SELECT day FROM activity ORDER BY day DESC').all();
    return _deriveStreak(rows.map(r => r.day), _activityDayKey(todayTimestampMs));
  }
}

export class SqlitePuzzleRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this._db = db;
  }

  /** @param {object} puzzle */
  save(puzzle) {
    const kind = puzzle.kind ?? 'tactical';
    const existing = this._db.prepare('SELECT id FROM puzzles WHERE fen = ? AND kind = ?').get(puzzle.fen, kind);
    if (existing) {
      this._db.prepare('UPDATE puzzles SET times_seen = times_seen + 1 WHERE fen = ? AND kind = ?').run(puzzle.fen, kind);
      return existing.id;
    }
    const id = puzzle.id ?? randomUUID();
    this._db.prepare(`
      INSERT INTO puzzles (id, kind, fen, side_to_move, best_move_uci, best_move_san, pv,
        accepted_moves_json, followup_uci, played_move_uci, played_move_san,
        cp_loss, win_loss_pts, classification, findability, temptation, instructiveness,
        tags, maia_model, policy_temperature, elo_at_creation, source_game_id, source_ply,
        phase, was_timed, times_seen, created_at)
      VALUES (@id, @kind, @fen, @side_to_move, @best_move_uci, @best_move_san, @pv,
        @accepted_moves_json, @followup_uci, @played_move_uci, @played_move_san,
        @cp_loss, @win_loss_pts, @classification, @findability, @temptation, @instructiveness,
        @tags, @maia_model, @policy_temperature, @elo_at_creation, @source_game_id, @source_ply,
        @phase, @was_timed, 1, @created_at)
    `).run({
      id,
      kind,
      fen: puzzle.fen,
      side_to_move: puzzle.sideToMove,
      best_move_uci: puzzle.bestMoveUci,
      best_move_san: puzzle.bestMoveSan,
      pv: puzzle.pv ?? null,
      accepted_moves_json: puzzle.acceptedMovesJson ?? null,
      followup_uci: puzzle.followupUci ?? null,
      played_move_uci: puzzle.playedMoveUci ?? null,
      played_move_san: puzzle.playedMoveSan ?? null,
      cp_loss: puzzle.cpLoss ?? null,
      win_loss_pts: puzzle.winLossPts ?? null,
      classification: puzzle.classification ?? null,
      findability: puzzle.findability ?? null,
      temptation: puzzle.temptation ?? null,
      instructiveness: puzzle.instructiveness ?? null,
      tags: puzzle.tags ?? null,
      maia_model: puzzle.maiaModel ?? null,
      policy_temperature: puzzle.policyTemperature ?? null,
      elo_at_creation: puzzle.eloAtCreation ?? null,
      source_game_id: puzzle.sourceGameId ?? null,
      source_ply: puzzle.sourcePly ?? null,
      phase: puzzle.phase ?? null,
      was_timed: puzzle.wasTimed ? 1 : 0,
      created_at: puzzle.createdAt ?? Date.now(),
    });
    return id;
  }

  /**
   * @param {string} fen
   * @param {string} kind
   * @returns {object|null}
   */
  getByFenAndKind(fen, kind) {
    return this._db.prepare('SELECT * FROM puzzles WHERE fen = ? AND kind = ?').get(fen, kind) ?? null;
  }

  /**
   * @param {string} id
   * @param {string} acceptedMovesJson
   */
  updateAcceptedMoves(id, acceptedMovesJson) {
    this._db.prepare('UPDATE puzzles SET accepted_moves_json = ? WHERE id = ?').run(acceptedMovesJson, id);
  }

  /**
   * Returns true if an opening puzzle for this FEN has been drilled at least once.
   * @param {string} fen
   * @returns {boolean}
   */
  hasDrilledCard(fen) {
    const row = this._db.prepare(`
      SELECT 1 FROM puzzles p
      JOIN fsrs_cards f ON f.puzzle_id = p.id
      WHERE p.fen = ? AND p.kind = 'opening' AND f.reps > 0
      LIMIT 1
    `).get(fen);
    return !!row;
  }

  /** @param {string} id @returns {object} */
  findById(id) {
    const row = this._db.prepare('SELECT * FROM puzzles WHERE id = ?').get(id);
    if (!row) throw new PuzzleNotFoundError(`Puzzle '${id}' not found`);
    return row;
  }

  /**
   * @param {number} now — timestamp ms
   * @returns {object[]}
   */
  getDueCards(now) {
    return this._db.prepare(`
      SELECT p.id, p.kind, p.fen, p.side_to_move, p.best_move_uci, p.best_move_san,
        p.accepted_moves_json, p.findability, p.instructiveness, p.tags,
        f.due, f.stability, f.difficulty, f.reps, f.lapses, f.state, f.graduated
      FROM puzzles p
      JOIN fsrs_cards f ON f.puzzle_id = p.id
      WHERE f.due <= ? AND f.graduated = 0
      ORDER BY f.due ASC
    `).all(now);
  }

  /**
   * @param {string} puzzleId
   * @returns {object|null}
   */
  getCard(puzzleId) {
    const row = this._db.prepare('SELECT * FROM fsrs_cards WHERE puzzle_id = ?').get(puzzleId);
    if (!row) return null;
    return {
      puzzleId: row.puzzle_id,
      due: row.due,
      stability: row.stability,
      difficulty: row.difficulty,
      elapsedDays: row.elapsed_days,
      scheduledDays: row.scheduled_days,
      reps: row.reps,
      lapses: row.lapses,
      state: row.state,
      lastReview: row.last_review,
      graduated: row.graduated === 1,
    };
  }

  /** @returns {object[]} */
  listAll() {
    return this._db.prepare(`
      SELECT p.*, f.graduated, f.reps, f.lapses
      FROM puzzles p
      LEFT JOIN fsrs_cards f ON f.puzzle_id = p.id
    `).all();
  }

  /** @returns {Object<string, number>} map of gameId → puzzle count */
  getPuzzleCountsByGameId() {
    const rows = this._db.prepare(
      'SELECT source_game_id, COUNT(*) as count FROM puzzles GROUP BY source_game_id'
    ).all();
    const map = {};
    for (const r of rows) map[r.source_game_id] = r.count;
    return map;
  }

  /**
   * Cards not yet due — for drill-ahead / practice mode.
   * @param {number} now — timestamp ms
   * @returns {object[]}
   */
  getPracticeCards(now) {
    return this._db.prepare(`
      SELECT p.*, f.due, f.stability, f.difficulty, f.reps, f.lapses, f.state, f.graduated
      FROM puzzles p
      JOIN fsrs_cards f ON f.puzzle_id = p.id
      WHERE f.due > ? AND f.graduated = 0
      ORDER BY p.instructiveness DESC
    `).all(now);
  }

  /**
   * @param {string} gameId
   * @returns {object[]}
   */
  listByGame(gameId) {
    return this._db.prepare(
      'SELECT * FROM puzzles WHERE source_game_id = ? ORDER BY source_ply'
    ).all(gameId);
  }

  /**
   * @param {object} review
   */
  saveReview(review) {
    this._db.prepare(`
      INSERT INTO reviews (id, puzzle_id, reviewed_at, correct, rating, ms_taken,
        attempted_move_uci, attempt_no, practice, suspect_recall)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      review.id ?? randomUUID(),
      review.puzzleId,
      review.reviewedAt,
      review.correct ? 1 : 0,
      review.rating ?? null,
      review.msTaken ?? null,
      review.attemptedMoveUci ?? null,
      review.attemptNo ?? 1,
      review.practice ?? 0,
      review.suspectRecall ?? 0,
    );
  }

  /**
   * Atomically save a review row and update the FSRS card in one transaction.
   * @param {object} review
   * @param {object} card
   */
  saveReviewAndCard(review, card) {
    this._db.transaction(() => {
      this.saveReview(review);
      this.saveCard(card);
    })();
  }

  /** @param {object} card */
  saveCard(card) {
    this._db.prepare(`
      INSERT INTO fsrs_cards (puzzle_id, due, stability, difficulty, elapsed_days,
        scheduled_days, reps, lapses, state, last_review, graduated)
      VALUES (@puzzle_id, @due, @stability, @difficulty, @elapsed_days,
        @scheduled_days, @reps, @lapses, @state, @last_review, @graduated)
      ON CONFLICT(puzzle_id) DO UPDATE SET
        due = excluded.due, stability = excluded.stability,
        difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days,
        scheduled_days = excluded.scheduled_days, reps = excluded.reps,
        lapses = excluded.lapses, state = excluded.state,
        last_review = excluded.last_review, graduated = excluded.graduated
    `).run({
      puzzle_id: card.puzzleId,
      due: card.due,
      stability: card.stability ?? null,
      difficulty: card.difficulty ?? null,
      elapsed_days: card.elapsedDays ?? null,
      scheduled_days: card.scheduledDays ?? null,
      reps: card.reps ?? 0,
      lapses: card.lapses ?? 0,
      state: card.state ?? null,
      last_review: card.lastReview ?? null,
      graduated: card.graduated ? 1 : 0,
    });
  }
}

export class SqliteSettingsRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this._db = db;
  }

  /** @param {string} key @returns {string|null} */
  get(key) {
    const row = this._db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  /** @param {string} key @param {string} value */
  set(key, value) {
    this._db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
  }
}

export class SqliteRepertoireRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this._db = db;
  }

  /** @param {Object} ctx @returns {number} */
  getOrCreateProvenance(ctx) {
    const existing = this._db.prepare(`
      SELECT id FROM rep_provenance
      WHERE balance_hash = ? AND schema_version = ?
        AND (sf_version IS ? OR sf_version = ?)
        AND (sf_depth IS ? OR sf_depth = ?)
        AND (sf_multipv IS ? OR sf_multipv = ?)
        AND (maia_weights_id IS ? OR maia_weights_id = ?)
      LIMIT 1
    `).get(
      ctx.balanceHash, ctx.schemaVersion,
      ctx.sfVersion ?? null, ctx.sfVersion ?? null,
      ctx.sfDepth ?? null, ctx.sfDepth ?? null,
      ctx.sfMultipv ?? null, ctx.sfMultipv ?? null,
      ctx.maiaWeightsId ?? null, ctx.maiaWeightsId ?? null,
    );
    if (existing) return existing.id;
    const result = this._db.prepare(`
      INSERT INTO rep_provenance
        (at, schema_version, balance_hash, app_git_sha, sf_version, sf_depth, sf_multipv, maia_weights_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Date.now(), ctx.schemaVersion, ctx.balanceHash,
      ctx.appGitSha ?? null, ctx.sfVersion ?? null,
      ctx.sfDepth ?? null, ctx.sfMultipv ?? null, ctx.maiaWeightsId ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  /** @returns {number} */
  getCurrentBookVersion() {
    return this._db.prepare('SELECT version FROM rep_book_version WHERE singleton = 0').get().version;
  }

  /** @returns {number} */
  incrementBookVersion() {
    this._db.prepare('UPDATE rep_book_version SET version = version + 1 WHERE singleton = 0').run();
    return this.getCurrentBookVersion();
  }

  /** @param {Object} obs @returns {void} */
  appendObservation(obs) {
    this._db.prepare(`
      INSERT INTO rep_observations
        (game_id, ply, epd, side, move_uci, move_san, win_loss_pts, classification,
         played_at, source, provenance_id, book_version)
      VALUES
        (@game_id, @ply, @epd, @side, @move_uci, @move_san, @win_loss_pts, @classification,
         @played_at, @source, @provenance_id, @book_version)
    `).run({
      game_id: obs.gameId, ply: obs.ply, epd: obs.epd, side: obs.side,
      move_uci: obs.moveUci, move_san: obs.moveSan ?? null,
      win_loss_pts: obs.winLossPts ?? null, classification: obs.classification ?? null,
      played_at: obs.playedAt, source: obs.source,
      provenance_id: obs.provenanceId, book_version: obs.bookVersion,
    });
  }

  /** @param {string} epd @param {string} side @returns {Object[]} */
  getObservationsForNode(epd, side) {
    return this._db.prepare(
      'SELECT * FROM rep_observations WHERE epd = ? AND side = ? ORDER BY played_at'
    ).all(epd, side).map(_obsRow);
  }

  /** @param {Object} dev @returns {void} */
  appendDeviation(dev) {
    this._db.prepare(`
      INSERT INTO rep_deviations
        (id, game_id, ply, epd, kind, played_uci, book_uci, resolution,
         decision_ms_taken, provenance_id, book_version)
      VALUES
        (@id, @game_id, @ply, @epd, @kind, @played_uci, @book_uci, @resolution,
         @decision_ms_taken, @provenance_id, @book_version)
    `).run({
      id: dev.id, game_id: dev.gameId, ply: dev.ply, epd: dev.epd,
      kind: dev.kind, played_uci: dev.playedUci, book_uci: dev.bookUci ?? null,
      resolution: dev.resolution ?? null, decision_ms_taken: dev.decisionMsTaken ?? null,
      provenance_id: dev.provenanceId, book_version: dev.bookVersion,
    });
  }

  /** @param {string} gameId @returns {Object[]} */
  getDeviationsForGame(gameId) {
    return this._db.prepare(
      'SELECT * FROM rep_deviations WHERE game_id = ? ORDER BY ply'
    ).all(gameId).map(_devRow);
  }

  /** @param {number} [limit] @returns {Object[]} */
  getAllDeviations(limit = 200) {
    return this._db.prepare('SELECT * FROM rep_deviations ORDER BY rowid DESC LIMIT ?').all(limit).map(_devRow);
  }

  /** @param {Object} audit @returns {void} */
  appendAudit(audit) {
    this._db.prepare(`
      INSERT INTO rep_audits
        (id, epd, side, move_uci, depth, multipv, win_pct, cp, pv, run_at, provenance_id, book_version)
      VALUES
        (@id, @epd, @side, @move_uci, @depth, @multipv, @win_pct, @cp, @pv, @run_at, @provenance_id, @book_version)
    `).run({
      id: audit.id, epd: audit.epd, side: audit.side, move_uci: audit.moveUci,
      depth: audit.depth, multipv: audit.multipv, win_pct: audit.winPct ?? null,
      cp: audit.cp ?? null, pv: audit.pv ?? null, run_at: audit.runAt,
      provenance_id: audit.provenanceId, book_version: audit.bookVersion,
    });
  }

  /** @param {string} id @returns {Object|null} */
  getAudit(id) {
    const row = this._db.prepare('SELECT * FROM rep_audits WHERE id = ?').get(id);
    return row ? _auditRow(row) : null;
  }

  /** @param {Object} challenge @returns {void} */
  openChallenge(challenge) {
    this._db.prepare(`
      INSERT INTO rep_challenges (
        id, epd, side, fen, incumbent_uci, challenger_uci,
        opened_game_id, opened_ply, opened_at,
        inc_observations, inc_mean_win_loss_pts,
        inc_score_w, inc_score_d, inc_score_l, inc_card_state,
        challenger_plays, incumbent_plays, encounters_since_open,
        move_ms_taken, move_ms_zscore, decision_ms_taken,
        engine_delta_win_pts, engine_audit_id,
        trend_challenger, trend_incumbent,
        result_challenger_perf, result_challenger_n,
        result_incumbent_perf, result_incumbent_n,
        status, resolution_rule, resolved_at, resolved_by, gate_reason,
        provenance_id, book_version
      ) VALUES (
        @id, @epd, @side, @fen, @incumbent_uci, @challenger_uci,
        @opened_game_id, @opened_ply, @opened_at,
        @inc_observations, @inc_mean_win_loss_pts,
        @inc_score_w, @inc_score_d, @inc_score_l, @inc_card_state,
        @challenger_plays, @incumbent_plays, @encounters_since_open,
        @move_ms_taken, @move_ms_zscore, @decision_ms_taken,
        @engine_delta_win_pts, @engine_audit_id,
        @trend_challenger, @trend_incumbent,
        @result_challenger_perf, @result_challenger_n,
        @result_incumbent_perf, @result_incumbent_n,
        @status, @resolution_rule, @resolved_at, @resolved_by, @gate_reason,
        @provenance_id, @book_version
      )
    `).run({
      id: challenge.id, epd: challenge.epd, side: challenge.side, fen: challenge.fen,
      incumbent_uci: challenge.incumbentUci, challenger_uci: challenge.challengerUci,
      opened_game_id: challenge.openedGameId, opened_ply: challenge.openedPly,
      opened_at: challenge.openedAt,
      inc_observations: challenge.incObservations ?? null,
      inc_mean_win_loss_pts: challenge.incMeanWinLossPts ?? null,
      inc_score_w: challenge.incScoreW ?? null, inc_score_d: challenge.incScoreD ?? null,
      inc_score_l: challenge.incScoreL ?? null, inc_card_state: challenge.incCardState ?? null,
      challenger_plays: challenge.challengerPlays ?? 0,
      incumbent_plays: challenge.incumbentPlays ?? 0,
      encounters_since_open: challenge.encountersSinceOpen ?? 0,
      move_ms_taken: challenge.moveMsTaken ?? null,
      move_ms_zscore: challenge.moveMsZscore ?? null,
      decision_ms_taken: challenge.decisionMsTaken ?? null,
      engine_delta_win_pts: challenge.engineDeltaWinPts ?? null,
      engine_audit_id: challenge.engineAuditId ?? null,
      trend_challenger: challenge.trendChallenger ?? null,
      trend_incumbent: challenge.trendIncumbent ?? null,
      result_challenger_perf: challenge.resultChallengerPerf ?? null,
      result_challenger_n: challenge.resultChallengerN ?? 0,
      result_incumbent_perf: challenge.resultIncumbentPerf ?? null,
      result_incumbent_n: challenge.resultIncumbentN ?? 0,
      status: challenge.status ?? 'open',
      resolution_rule: challenge.resolutionRule ?? null,
      resolved_at: challenge.resolvedAt ?? null,
      resolved_by: challenge.resolvedBy ?? null,
      gate_reason: challenge.gateReason ?? null,
      provenance_id: challenge.provenanceId, book_version: challenge.bookVersion,
    });
  }

  /** @param {string} id @param {Object} patch @returns {void} */
  updateChallenge(id, patch) {
    const colMap = {
      challengerPlays: 'challenger_plays', incumbentPlays: 'incumbent_plays',
      encountersSinceOpen: 'encounters_since_open', moveMsTaken: 'move_ms_taken',
      moveMsZscore: 'move_ms_zscore', decisionMsTaken: 'decision_ms_taken',
      engineDeltaWinPts: 'engine_delta_win_pts', engineAuditId: 'engine_audit_id',
      trendChallenger: 'trend_challenger', trendIncumbent: 'trend_incumbent',
      resultChallengerPerf: 'result_challenger_perf', resultChallengerN: 'result_challenger_n',
      resultIncumbentPerf: 'result_incumbent_perf', resultIncumbentN: 'result_incumbent_n',
      status: 'status', resolutionRule: 'resolution_rule',
      resolvedAt: 'resolved_at', resolvedBy: 'resolved_by', gateReason: 'gate_reason',
      gateVerdict: 'gate_verdict',
    };
    const sets = [];
    const params = {};
    for (const [key, col] of Object.entries(colMap)) {
      if (key in patch) {
        sets.push(`${col} = @${key}`);
        params[key] = patch[key];
      }
    }
    if (sets.length === 0) return;
    params._id = id;
    this._db.prepare(`UPDATE rep_challenges SET ${sets.join(', ')} WHERE id = @_id`).run(params);
  }

  /** @param {string} id @returns {Object|null} */
  getChallenge(id) {
    const row = this._db.prepare('SELECT * FROM rep_challenges WHERE id = ?').get(id);
    return row ? _challengeRow(row) : null;
  }

  /** @param {string} epd @param {string} side @returns {Object|null} */
  getOpenChallenge(epd, side) {
    const row = this._db.prepare(
      "SELECT * FROM rep_challenges WHERE epd = ? AND side = ? AND status = 'open' LIMIT 1"
    ).get(epd, side);
    return row ? _challengeRow(row) : null;
  }

  /** @returns {Object[]} */
  listOpenChallenges() {
    return this._db.prepare(
      "SELECT * FROM rep_challenges WHERE status = 'open' ORDER BY opened_at ASC"
    ).all().map(_challengeRow);
  }

  /** @param {Object} entry @returns {void} */
  appendChangelog(entry) {
    this._db.prepare(`
      INSERT INTO rep_changelog
        (id, at, epd, side, kind, from_uci, to_uci, challenge_id, rule, detail_json,
         provenance_id, book_version)
      VALUES
        (@id, @at, @epd, @side, @kind, @from_uci, @to_uci, @challenge_id, @rule, @detail_json,
         @provenance_id, @book_version)
    `).run({
      id: entry.id, at: entry.at, epd: entry.epd, side: entry.side, kind: entry.kind,
      from_uci: entry.fromUci ?? null, to_uci: entry.toUci ?? null,
      challenge_id: entry.challengeId ?? null, rule: entry.rule ?? null,
      detail_json: entry.detailJson ?? null,
      provenance_id: entry.provenanceId, book_version: entry.bookVersion,
    });
  }

  /** @param {number} [limit] @returns {Object[]} */
  getChangelog(limit = 50) {
    return this._db.prepare('SELECT * FROM rep_changelog ORDER BY at DESC LIMIT ?').all(limit)
      .map(_changelogRow);
  }

  /** @param {string} id @returns {Object|null} */
  getChangelogEntry(id) {
    const row = this._db.prepare('SELECT * FROM rep_changelog WHERE id = ?').get(id);
    return row ? _changelogRow(row) : null;
  }

  /** @param {{ from?: number, to?: number, cursor?: number, limit?: number }} [opts] @returns {Object[]} */
  getChangelogRange({ from, to, cursor, limit = 500 } = {}) {
    let query = 'SELECT * FROM rep_changelog WHERE 1=1';
    const params = [];
    if (from != null)   { query += ' AND at >= ?'; params.push(from); }
    if (to != null)     { query += ' AND at <= ?'; params.push(to); }
    if (cursor != null) { query += ' AND at > ?';  params.push(cursor); }
    query += ' ORDER BY at ASC LIMIT ?';
    params.push(limit);
    return this._db.prepare(query).all(...params).map(_changelogRow);
  }

  /** @param {Object} supp @returns {void} */
  upsertSuppression(supp) {
    this._db.prepare(`
      INSERT OR REPLACE INTO rep_suppressions
        (epd, side, move_uci, until_encounters, created_at, changelog_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(supp.epd, supp.side, supp.moveUci, supp.untilEncounters, supp.createdAt, supp.changelogId ?? null);
  }

  /** @param {string} epd @param {string} side @param {string} moveUci @returns {Object|null} */
  getSuppression(epd, side, moveUci) {
    const row = this._db.prepare(
      'SELECT * FROM rep_suppressions WHERE epd = ? AND side = ? AND move_uci = ?'
    ).get(epd, side, moveUci);
    if (!row) return null;
    return {
      epd: row.epd, side: row.side, moveUci: row.move_uci,
      untilEncounters: row.until_encounters, createdAt: row.created_at,
      changelogId: row.changelog_id,
    };
  }

  /** @param {Object} node @returns {void} */
  upsertNode(node) {
    this._db.prepare(`
      INSERT OR REPLACE INTO rep_nodes
        (epd, side, fen, first_seen, last_seen, times_reached, encounters, min_ply,
         reach_prob, reach_stale, line_loss, vote_frozen_until_encounter)
      VALUES
        (@epd, @side, @fen, @first_seen, @last_seen, @times_reached, @encounters, @min_ply,
         @reach_prob, @reach_stale, @line_loss, @vote_frozen_until_encounter)
    `).run({
      epd: node.epd, side: node.side, fen: node.fen ?? null,
      first_seen: node.firstSeen ?? null, last_seen: node.lastSeen ?? null,
      times_reached: node.timesReached ?? 0, encounters: node.encounters ?? 0,
      min_ply: node.minPly ?? null, reach_prob: node.reachProb ?? null,
      reach_stale: node.reachStale ? 1 : 0, line_loss: node.lineLoss ?? null,
      vote_frozen_until_encounter: node.voteFrozenUntilEncounter ?? null,
    });
  }

  /** @param {string} epd @param {string} side @returns {Object|null} */
  getNode(epd, side) {
    const row = this._db.prepare('SELECT * FROM rep_nodes WHERE epd = ? AND side = ?').get(epd, side);
    return row ? _nodeRow(row) : null;
  }

  /** @returns {Object[]} */
  listNodes() {
    return this._db.prepare('SELECT * FROM rep_nodes ORDER BY epd, side').all().map(_nodeRow);
  }

  /** Returns the number of (epd, side) nodes that have at least one canonical move (B13). */
  countCanonicalNodes() {
    const row = this._db.prepare(
      "SELECT COUNT(DISTINCT epd || '|' || side) AS n FROM rep_moves WHERE role = 'canonical'"
    ).get();
    return row?.n ?? 0;
  }

  /** @param {Object} move @returns {void} */
  upsertMove(move) {
    this._db.prepare(`
      INSERT OR REPLACE INTO rep_moves
        (epd, side, move_uci, move_san, role, observations, weighted_score,
         mean_win_loss_pts, worst_win_loss_pts, audit_id, gate_reason,
         score_w, score_d, score_l, first_played, last_played)
      VALUES
        (@epd, @side, @move_uci, @move_san, @role, @observations, @weighted_score,
         @mean_win_loss_pts, @worst_win_loss_pts, @audit_id, @gate_reason,
         @score_w, @score_d, @score_l, @first_played, @last_played)
    `).run({
      epd: move.epd, side: move.side, move_uci: move.moveUci, move_san: move.moveSan ?? null,
      role: move.role, observations: move.observations ?? 0,
      weighted_score: move.weightedScore ?? null,
      mean_win_loss_pts: move.meanWinLossPts ?? null,
      worst_win_loss_pts: move.worstWinLossPts ?? null,
      audit_id: move.auditId ?? null, gate_reason: move.gateReason ?? null,
      score_w: move.scoreW ?? 0, score_d: move.scoreD ?? 0, score_l: move.scoreL ?? 0,
      first_played: move.firstPlayed ?? null, last_played: move.lastPlayed ?? null,
    });
  }

  /** @param {string} epd @param {string} side @param {string} moveUci @returns {Object|null} */
  getMove(epd, side, moveUci) {
    const row = this._db.prepare(
      'SELECT * FROM rep_moves WHERE epd = ? AND side = ? AND move_uci = ?'
    ).get(epd, side, moveUci);
    return row ? _moveRow(row) : null;
  }

  /** @param {string} epd @param {string} side @returns {Object[]} */
  getMovesForNode(epd, side) {
    return this._db.prepare(
      'SELECT * FROM rep_moves WHERE epd = ? AND side = ? ORDER BY role, move_uci'
    ).all(epd, side).map(_moveRow);
  }

  /**
   * Update reach_prob and clear reach_stale for a single node.
   * @param {string} epd
   * @param {string} side
   * @param {number} reachProb
   */
  updateNodeReachProb(epd, side, reachProb) {
    this._db.prepare(
      'UPDATE rep_nodes SET reach_prob = ?, reach_stale = 0 WHERE epd = ? AND side = ?'
    ).run(reachProb, epd, side);
  }

  /** @param {Object} policy @returns {void} */
  upsertPolicy(policy) {
    this._db.prepare(`
      INSERT OR REPLACE INTO rep_policy (epd, maia_model, maia_weights_id, policy_json, computed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(policy.epd, policy.maiaModel, policy.maiaWeightsId, policy.policyJson, policy.computedAt);
  }

  /** @param {string} epd @param {string} maiaModel @param {string} maiaWeightsId @returns {Object|null} */
  getPolicy(epd, maiaModel, maiaWeightsId) {
    const row = this._db.prepare(
      'SELECT * FROM rep_policy WHERE epd = ? AND maia_model = ? AND maia_weights_id = ?'
    ).get(epd, maiaModel, maiaWeightsId);
    if (!row) return null;
    return {
      epd: row.epd, maiaModel: row.maia_model, maiaWeightsId: row.maia_weights_id,
      policyJson: row.policy_json, computedAt: row.computed_at,
    };
  }

  /** @param {Function} fn @returns {any} */
  transaction(fn) {
    return this._db.transaction(fn)();
  }
}

// ─── row mappers ─────────────────────────────────────────────────────────────

function _obsRow(r) {
  return {
    gameId: r.game_id, ply: r.ply, epd: r.epd, side: r.side,
    moveUci: r.move_uci, moveSan: r.move_san,
    winLossPts: r.win_loss_pts, classification: r.classification,
    playedAt: r.played_at, source: r.source,
    provenanceId: r.provenance_id, bookVersion: r.book_version,
  };
}

function _devRow(r) {
  return {
    id: r.id, gameId: r.game_id, ply: r.ply, epd: r.epd, kind: r.kind,
    playedUci: r.played_uci, bookUci: r.book_uci, resolution: r.resolution,
    decisionMsTaken: r.decision_ms_taken,
    provenanceId: r.provenance_id, bookVersion: r.book_version,
  };
}

function _auditRow(r) {
  return {
    id: r.id, epd: r.epd, side: r.side, moveUci: r.move_uci,
    depth: r.depth, multipv: r.multipv, winPct: r.win_pct,
    cp: r.cp, pv: r.pv, runAt: r.run_at,
    provenanceId: r.provenance_id, bookVersion: r.book_version,
  };
}

function _challengeRow(r) {
  return {
    id: r.id, epd: r.epd, side: r.side, fen: r.fen,
    incumbentUci: r.incumbent_uci, challengerUci: r.challenger_uci,
    openedGameId: r.opened_game_id, openedPly: r.opened_ply, openedAt: r.opened_at,
    incObservations: r.inc_observations, incMeanWinLossPts: r.inc_mean_win_loss_pts,
    incScoreW: r.inc_score_w, incScoreD: r.inc_score_d, incScoreL: r.inc_score_l,
    incCardState: r.inc_card_state,
    challengerPlays: r.challenger_plays, incumbentPlays: r.incumbent_plays,
    encountersSinceOpen: r.encounters_since_open,
    moveMsTaken: r.move_ms_taken, moveMsZscore: r.move_ms_zscore,
    decisionMsTaken: r.decision_ms_taken,
    engineDeltaWinPts: r.engine_delta_win_pts, engineAuditId: r.engine_audit_id,
    trendChallenger: r.trend_challenger, trendIncumbent: r.trend_incumbent,
    resultChallengerPerf: r.result_challenger_perf, resultChallengerN: r.result_challenger_n,
    resultIncumbentPerf: r.result_incumbent_perf, resultIncumbentN: r.result_incumbent_n,
    status: r.status, resolutionRule: r.resolution_rule,
    resolvedAt: r.resolved_at, resolvedBy: r.resolved_by,
    gateReason: r.gate_reason, gateVerdict: r.gate_verdict ?? null,
    provenanceId: r.provenance_id, bookVersion: r.book_version,
  };
}

function _changelogRow(r) {
  return {
    id: r.id, at: r.at, epd: r.epd, side: r.side, kind: r.kind,
    fromUci: r.from_uci, toUci: r.to_uci, challengeId: r.challenge_id,
    rule: r.rule, detailJson: r.detail_json,
    provenanceId: r.provenance_id, bookVersion: r.book_version,
  };
}

function _nodeRow(r) {
  return {
    epd: r.epd, side: r.side, fen: r.fen,
    firstSeen: r.first_seen, lastSeen: r.last_seen,
    timesReached: r.times_reached, encounters: r.encounters,
    minPly: r.min_ply, reachProb: r.reach_prob,
    reachStale: r.reach_stale === 1,
    lineLoss: r.line_loss, voteFrozenUntilEncounter: r.vote_frozen_until_encounter,
  };
}

function _moveRow(r) {
  return {
    epd: r.epd, side: r.side, moveUci: r.move_uci, moveSan: r.move_san,
    role: r.role, observations: r.observations, weightedScore: r.weighted_score,
    meanWinLossPts: r.mean_win_loss_pts, worstWinLossPts: r.worst_win_loss_pts,
    auditId: r.audit_id, gateReason: r.gate_reason,
    scoreW: r.score_w, scoreD: r.score_d, scoreL: r.score_l,
    firstPlayed: r.first_played, lastPlayed: r.last_played,
  };
}
