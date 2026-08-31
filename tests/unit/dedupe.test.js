import { describe, it, expect, vi } from 'vitest';

import { dedupeAndSave } from '../../src/domain/puzzles/dedupe.js';
import { InMemoryPuzzleRepository } from '../../src/adapters/memory/repositories.js';

const E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

function basePuzzle(overrides = {}) {
  return {
    fen: E4_FEN,
    kind: 'tactical',
    bestMoveUci: 'e7e5',
    playedMoveUci: 'c7c5',
    winLossPts: 15,
    findability: 0.3,
    temptation: 0.1,
    instructiveness: 4.5,
    maiaModel: 'maia-1500',
    policyTemperature: 1.0,
    ...overrides,
  };
}

function mockMaiaClient(bestMove = 'e7e5', playedMove = 'c7c5') {
  return {
    policy: vi.fn().mockResolvedValue(new Map([
      [bestMove, 0.7],
      [playedMove, 0.15],
    ])),
  };
}

describe('dedupeAndSave', () => {
  it('a repeated FEN bumps times_seen instead of inserting', async () => {
    const repo = new InMemoryPuzzleRepository();
    await dedupeAndSave({ puzzle: basePuzzle(), puzzleRepo: repo, maiaClient: null });
    await dedupeAndSave({ puzzle: basePuzzle(), puzzleRepo: repo, maiaClient: null });
    await dedupeAndSave({ puzzle: basePuzzle(), puzzleRepo: repo, maiaClient: null });

    const stored = repo.getByFenAndKind(E4_FEN, 'tactical');
    expect(stored.timesSeen).toBe(3);
    expect(repo.listAll()).toHaveLength(1);
  });

  it('findability is recomputed only when nearest maia_model has changed', async () => {
    const repo = new InMemoryPuzzleRepository();
    await dedupeAndSave({ puzzle: basePuzzle({ maiaModel: 'maia-1500' }), puzzleRepo: repo, maiaClient: null });

    const client = mockMaiaClient();

    // Same model — no recompute
    const r1 = await dedupeAndSave({
      puzzle: basePuzzle({ maiaModel: 'maia-1500' }),
      puzzleRepo: repo,
      maiaClient: client,
    });
    expect(r1.recomputed).toBe(false);
    expect(client.policy).not.toHaveBeenCalled();

    // Different model — recompute fires
    const r2 = await dedupeAndSave({
      puzzle: basePuzzle({ maiaModel: 'maia-1700' }),
      puzzleRepo: repo,
      maiaClient: client,
    });
    expect(r2.recomputed).toBe(true);
    expect(client.policy).toHaveBeenCalledOnce();
  });

  it('a recompute records both the old and new maia_model', async () => {
    const repo = new InMemoryPuzzleRepository();
    await dedupeAndSave({
      puzzle: basePuzzle({ maiaModel: 'maia-1500', findability: 0.3 }),
      puzzleRepo: repo,
      maiaClient: null,
    });

    const client = mockMaiaClient();
    const result = await dedupeAndSave({
      puzzle: basePuzzle({ maiaModel: 'maia-1700' }),
      puzzleRepo: repo,
      maiaClient: client,
    });

    expect(result.recomputed).toBe(true);
    expect(result.oldMaiaModel).toBe('maia-1500');
    expect(result.newMaiaModel).toBe('maia-1700');

    const stored = repo.getByFenAndKind(E4_FEN, 'tactical');
    expect(stored.maiaModel).toBe('maia-1700');
    // findability updated to 0.7 (policy.get('e7e5') from the mock)
    expect(stored.findability).toBeCloseTo(0.7);
  });
});
