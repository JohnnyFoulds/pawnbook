/**
 * @module adapters/memory/repositories
 * In-memory implementations — a first-class peer to SqliteRepository, not a stub.
 */

import { randomUUID } from 'crypto';

import { GameNotFoundError, PuzzleNotFoundError } from '../../errors.js';

export class InMemoryGameRepository {
  constructor() {
    this._games = new Map();
    this._moves = new Map(); // gameId → move[]
    this._eloHistory = [];
    this._settings = new Map();
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
