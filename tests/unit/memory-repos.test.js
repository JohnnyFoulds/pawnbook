import { describe, it, expect } from 'vitest';

import { InMemoryGameRepository, InMemoryPuzzleRepository } from '../../src/adapters/memory/repositories.js';

describe('InMemoryGameRepository — id and default branches', () => {
  it('save without id generates a UUID', () => {
    const repo = new InMemoryGameRepository();
    const id = repo.save({ opponentId: 'maia-1300', playerColor: 'white' });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('updateElo without historyId and recordedAt uses defaults', () => {
    const repo = new InMemoryGameRepository();
    const gameId = repo.save({ id: 'g1' });
    // Should not throw when historyId and recordedAt are omitted
    repo.updateElo(gameId, { eloBefore: 1200, eloAfter: 1215 });
    const history = repo.getEloHistory();
    expect(history.length).toBe(1);
    expect(history[0].elo).toBe(1215);
    // id should be a generated UUID (string), recordedAt should be a number
    expect(typeof history[0].id).toBe('string');
    expect(typeof history[0].recordedAt).toBe('number');
  });

  it('updateElo when game does not exist still records history', () => {
    const repo = new InMemoryGameRepository();
    // gameId not in _games — the if(game) branch is false; history still written
    repo.updateElo('nonexistent', { eloBefore: 1200, eloAfter: 1210 });
    const history = repo.getEloHistory();
    expect(history.length).toBe(1);
  });
});

describe('InMemoryGameRepository — listRecent and savePreEval branch coverage', () => {
  it('listRecent fires ?? 0 for both comparands when games lack startedAt', () => {
    const repo = new InMemoryGameRepository();
    repo.save({ id: 'g-no-started-1' });
    repo.save({ id: 'g-no-started-2' });
    const result = repo.listRecent();
    expect(result).toHaveLength(2);
  });

  it('savePreEval with empty evalData fires all four ?? null branches', () => {
    const repo = new InMemoryGameRepository();
    repo.savePreEval('g1', 0, 'fen1', {});
    const evals = repo.getEvals('g1');
    expect(evals[0].cp_white).toBeNull();
    expect(evals[0].mate_in).toBeNull();
    expect(evals[0].best_move_uci).toBeNull();
    expect(evals[0].pv).toBeNull();
  });
});

describe('InMemoryPuzzleRepository — id and dedup branches', () => {
  it('save without id generates a UUID', () => {
    const repo = new InMemoryPuzzleRepository();
    const id = repo.save({ fen: 'startfen', bestMoveUci: 'e2e4' });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('dedup bumps timesSeen even when existing puzzle has no timesSeen field', () => {
    const repo = new InMemoryPuzzleRepository();
    // Insert a puzzle without an explicit timesSeen — save() sets timesSeen=1
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const id = repo.save({ fen, bestMoveUci: 'e7e5' });
    // Manually remove timesSeen to simulate the edge case
    const puzzle = repo._puzzles.get(id);
    delete puzzle.timesSeen;
    // Re-insert same FEN → should hit `p.timesSeen ?? 1` and set timesSeen=2
    repo.save({ fen, bestMoveUci: 'e7e5' });
    const loaded = repo.findById(id);
    expect(loaded.timesSeen).toBe(2);
  });
});
