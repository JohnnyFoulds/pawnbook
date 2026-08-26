/**
 * @module adapters/sqlite/repositories
 * SQLite implementations of GameRepository, PuzzleRepository, SettingsRepository.
 */

import { randomUUID } from 'crypto';

import Database from 'better-sqlite3';

import { GameNotFoundError, PuzzleNotFoundError } from '../../errors.js';

import { applySchema } from './schema.js';


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
      INSERT INTO games (id, started_at, opponent_id, opponent_elo, player_color,
        status, ranked, time_control_initial_sec, time_control_inc_sec,
        clock_white_ms, clock_black_ms, elo_before, analysis_state)
      VALUES (@id, @started_at, @opponent_id, @opponent_elo, @player_color,
        @status, @ranked, @time_control_initial_sec, @time_control_inc_sec,
        @clock_white_ms, @clock_black_ms, @elo_before, @analysis_state)
      ON CONFLICT(id) DO UPDATE SET
        status                   = excluded.status,
        result                   = excluded.result,
        termination              = excluded.termination,
        pgn                      = excluded.pgn,
        played_at                = excluded.played_at,
        clock_white_ms           = excluded.clock_white_ms,
        clock_black_ms           = excluded.clock_black_ms,
        elo_before               = excluded.elo_before,
        elo_after                = excluded.elo_after,
        accuracy                 = excluded.accuracy,
        opponent_accuracy        = excluded.opponent_accuracy,
        analysis_state           = excluded.analysis_state,
        analysed_at              = excluded.analysed_at
    `);
    stmt.run({
      id: game.id ?? randomUUID(),
      started_at: game.startedAt ?? Date.now(),
      opponent_id: game.opponentId,
      opponent_elo: game.opponentElo ?? null,
      player_color: game.playerColor,
      status: game.status ?? 'in_progress',
      ranked: game.ranked ? 1 : 0,
      time_control_initial_sec: game.timeControlInitialSec ?? null,
      time_control_inc_sec: game.timeControlIncSec ?? null,
      clock_white_ms: game.clockWhiteMs ?? null,
      clock_black_ms: game.clockBlackMs ?? null,
      elo_before: game.eloBefore ?? null,
      analysis_state: game.analysisState ?? 'pending',
      result: game.result ?? null,
      termination: game.termination ?? null,
      pgn: game.pgn ?? null,
      played_at: game.playedAt ?? null,
      elo_after: game.eloAfter ?? null,
      accuracy: game.accuracy ?? null,
      opponent_accuracy: game.opponentAccuracy ?? null,
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
      timeControlInitialSec: row.time_control_initial_sec,
      timeControlIncSec: row.time_control_inc_sec,
      clockWhiteMs: row.clock_white_ms,
      clockBlackMs: row.clock_black_ms,
      eloBefore: row.elo_before,
      eloAfter: row.elo_after,
      accuracy: row.accuracy,
      opponentAccuracy: row.opponent_accuracy,
      analysisState: row.analysis_state,
      analysedAt: row.analysed_at,
    };
  }
}

export class SqlitePuzzleRepository {
  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this._db = db;
  }

  /** @param {object} puzzle */
  save(puzzle) {
    const existing = this._db.prepare('SELECT id FROM puzzles WHERE fen = ?').get(puzzle.fen);
    if (existing) {
      this._db.prepare('UPDATE puzzles SET times_seen = times_seen + 1 WHERE fen = ?').run(puzzle.fen);
      return existing.id;
    }
    const id = puzzle.id ?? randomUUID();
    this._db.prepare(`
      INSERT INTO puzzles (id, fen, side_to_move, best_move_uci, best_move_san, pv,
        accepted_moves_json, followup_uci, played_move_uci, played_move_san,
        cp_loss, win_loss_pts, classification, findability, temptation, instructiveness,
        tags, maia_model, policy_temperature, elo_at_creation, source_game_id, source_ply,
        phase, was_timed, times_seen, created_at)
      VALUES (@id, @fen, @side_to_move, @best_move_uci, @best_move_san, @pv,
        @accepted_moves_json, @followup_uci, @played_move_uci, @played_move_san,
        @cp_loss, @win_loss_pts, @classification, @findability, @temptation, @instructiveness,
        @tags, @maia_model, @policy_temperature, @elo_at_creation, @source_game_id, @source_ply,
        @phase, @was_timed, 1, @created_at)
    `).run({
      id,
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
      SELECT p.*, f.due, f.stability, f.difficulty, f.reps, f.lapses, f.state, f.graduated
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
