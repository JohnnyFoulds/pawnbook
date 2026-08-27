/**
 * @module adapters/memory/repositories
 * In-memory implementations — a first-class peer to SqliteRepository, not a stub.
 */

import { randomUUID } from 'crypto';

import { GameNotFoundError, PuzzleNotFoundError } from '../../errors.js';

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

function _deriveStreak(days, todayKey) {
  const daySet = new Set(days);
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

export class InMemoryGameRepository {
  constructor() {
    this._games = new Map();
    this._moves = new Map(); // gameId → move[]
    this._eloHistory = [];
    this._settings = new Map();
    this._activity = new Map(); // dayKey → {games, reviews}
  }

  save(game) {
    const id = game.id ?? randomUUID();
    this._games.set(id, { ...game, id });
    return id;
  }

  findById(id) {
    const game = this._games.get(id);
    if (!game) throw new GameNotFoundError(`Game '${id}' not found`);
    return { ...game };
  }

  appendMove(gameId, move) {
    if (!this._moves.has(gameId)) this._moves.set(gameId, []);
    this._moves.get(gameId).push({ ...move });
  }

  getMoves(gameId) {
    return (this._moves.get(gameId) ?? []).map(m => ({ ...m }));
  }

  abandonAllInProgress() {
    for (const [id, game] of this._games) {
      if (game.status === 'in_progress') this._games.set(id, { ...game, status: 'abandoned' });
    }
  }

  resetRunningAnalyses() {
    for (const [id, game] of this._games) {
      if (game.analysisState === 'running') {
        this._games.set(id, { ...game, analysisState: 'failed', analysisError: 'Server restarted during analysis' });
      }
    }
  }

  updateClock(gameId, whiteMs, blackMs) {
    const game = this._games.get(gameId);
    if (game) this._games.set(gameId, { ...game, clockWhiteMs: whiteMs, clockBlackMs: blackMs });
  }

  updateElo(gameId, { eloBefore, eloAfter, historyId, recordedAt }) {
    const game = this._games.get(gameId);
    if (game) {
      game.eloBefore = eloBefore;
      game.eloAfter = eloAfter;
    }
    this._eloHistory.push({ id: historyId ?? randomUUID(), recordedAt: recordedAt ?? Date.now(), elo: eloAfter, gameId });
    this._settings.set('elo', String(eloAfter));
  }

  getEloHistory() {
    return [...this._eloHistory].sort((a, b) => a.recordedAt - b.recordedAt);
  }

  listRecent(limit = 50) {
    return [...this._games.values()]
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
      .slice(0, limit);
  }

  getEvals(gameId) {
    return this._evals ? (this._evals.get(gameId) ?? []) : [];
  }

  saveMoveEval(eval_) {
    if (!this._evals) this._evals = new Map();
    const list = this._evals.get(eval_.gameId) ?? [];
    const idx = list.findIndex(e => e.ply === eval_.ply);
    if (idx >= 0) list[idx] = eval_; else list.push(eval_);
    this._evals.set(eval_.gameId, list);
  }

  savePreEval(gameId, ply, fen, evalData) {
    if (!this._evals) this._evals = new Map();
    const list = this._evals.get(gameId) ?? [];
    if (list.some(e => e.ply === ply)) return; // INSERT OR IGNORE semantics
    list.push({ gameId, ply, fen, cpWhite: evalData.cp ?? null, mateIn: evalData.mate ?? null,
      bestMoveUci: evalData.bestmove ?? null, pv: evalData.pv ?? null });
    this._evals.set(gameId, list);
  }

  recordActivity(timestampMs, type) {
    const day = _activityDayKey(timestampMs);
    const entry = this._activity.get(day) ?? { games: 0, reviews: 0 };
    if (type === 'game') entry.games += 1;
    else entry.reviews += 1;
    this._activity.set(day, entry);
  }

  getStreak(todayTimestampMs) {
    return _deriveStreak([...this._activity.keys()], _activityDayKey(todayTimestampMs));
  }
}

export class InMemoryPuzzleRepository {
  constructor() {
    this._puzzles = new Map();  // id → puzzle
    this._fenIndex = new Map(); // fen → id
    this._cards = new Map();    // puzzleId → card
  }

  save(puzzle) {
    const existing = this._fenIndex.get(puzzle.fen);
    if (existing) {
      const p = this._puzzles.get(existing);
      p.timesSeen = (p.timesSeen ?? 1) + 1;
      return existing;
    }
    const id = puzzle.id ?? randomUUID();
    const stored = { ...puzzle, id, timesSeen: 1, createdAt: puzzle.createdAt ?? Date.now() };
    this._puzzles.set(id, stored);
    this._fenIndex.set(puzzle.fen, id);
    return id;
  }

  findById(id) {
    const puzzle = this._puzzles.get(id);
    if (!puzzle) throw new PuzzleNotFoundError(`Puzzle '${id}' not found`);
    return { ...puzzle };
  }

  getDueCards(now) {
    const results = [];
    for (const [puzzleId, card] of this._cards) {
      if (card.due <= now && !card.graduated) {
        results.push({ ...this._puzzles.get(puzzleId), ...card });
      }
    }
    return results.sort((a, b) => a.due - b.due);
  }

  saveCard(card) {
    this._cards.set(card.puzzleId, { ...card });
  }

  getCard(puzzleId) {
    const card = this._cards.get(puzzleId);
    return card ? { ...card } : null;
  }

  listAll() {
    return [...this._puzzles.values()].map(p => {
      const card = this._cards.get(p.id);
      return { ...p, graduated: card?.graduated ?? false, reps: card?.reps ?? 0, lapses: card?.lapses ?? 0 };
    });
  }

  listByGame(gameId) {
    return [...this._puzzles.values()]
      .filter(p => p.sourceGameId === gameId)
      .sort((a, b) => (a.sourcePly ?? 0) - (b.sourcePly ?? 0));
  }

  saveReview(review) {
    if (!this._reviews) this._reviews = [];
    this._reviews.push({ ...review, id: review.id ?? randomUUID() });
  }
}

export class InMemorySettingsRepository {
  constructor() {
    this._store = new Map();
  }

  get(key) {
    return this._store.get(key) ?? null;
  }

  set(key, value) {
    this._store.set(key, String(value));
  }
}
