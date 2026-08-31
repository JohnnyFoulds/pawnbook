import { describe, it, expect } from 'vitest';

import { selectPuzzles, buildAcceptedMoves, derivePhase } from '../../src/domain/puzzles/select.js';
import { FINDABILITY_MIN, PUZZLES_PER_GAME_MAX } from '../../src/shared/balance.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const E4_FEN   = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

// A candidate that passes the findability gate
function makeCandidate(overrides = {}) {
  return {
    fen: E4_FEN,
    ply: 10,
    findability: 0.15,
    instructiveness: 3.0,
    winLossPts: 20,
    classification: 'mistake',
    bestMoveUci: 'e7e5',
    ...overrides,
  };
}

describe('selectPuzzles', () => {
  it('findability >= FINDABILITY_MIN becomes a puzzle', () => {
    const candidates = [makeCandidate({ findability: FINDABILITY_MIN })];
    const selected = selectPuzzles(candidates);
    expect(selected).toHaveLength(1);
  });

  it('findability < FINDABILITY_MIN is excluded from the queue', () => {
    const candidates = [makeCandidate({ findability: FINDABILITY_MIN - 0.001 })];
    const selected = selectPuzzles(candidates);
    expect(selected).toHaveLength(0);
  });

  it('puzzles are ranked by instructiveness descending', () => {
    const candidates = [
      makeCandidate({ instructiveness: 1.0, fen: START_FEN, ply: 1 }),
      makeCandidate({ instructiveness: 5.0, fen: E4_FEN, ply: 2 }),
      makeCandidate({ instructiveness: 3.0, fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1', ply: 3 }),
    ];
    const selected = selectPuzzles(candidates);
    expect(selected[0].instructiveness).toBe(5.0);
    expect(selected[1].instructiveness).toBe(3.0);
    expect(selected[2].instructiveness).toBe(1.0);
  });

  it('capped at PUZZLES_PER_GAME_MAX', () => {
    const candidates = Array.from({ length: PUZZLES_PER_GAME_MAX + 3 }, (_, i) =>
      makeCandidate({ instructiveness: i, ply: i + 1 })
    );
    const selected = selectPuzzles(candidates);
    expect(selected.length).toBeLessThanOrEqual(PUZZLES_PER_GAME_MAX);
  });

  it('tags wasTimed from opts', () => {
    const candidates = [makeCandidate()];
    const selected = selectPuzzles(candidates, { wasTimed: true });
    expect(selected[0].wasTimed).toBe(true);
  });

  it('wasTimed defaults to false', () => {
    const candidates = [makeCandidate()];
    const selected = selectPuzzles(candidates);
    expect(selected[0].wasTimed).toBe(false);
  });

  it('derives phase for each selected puzzle', () => {
    const candidates = [makeCandidate({ ply: 5 })];
    const selected = selectPuzzles(candidates);
    expect(['opening', 'middlegame', 'endgame']).toContain(selected[0].phase);
  });

  it('returns empty array when no candidates pass the gate', () => {
    const selected = selectPuzzles([]);
    expect(selected).toEqual([]);
  });
});

describe('buildAcceptedMoves', () => {
  it('always includes the best move', () => {
    const result = buildAcceptedMoves('e2e4', [], 100);
    const moves = JSON.parse(result);
    expect(moves).toContain('e2e4');
  });

  it('includes alternative moves within NEAR_MISS_WIN_PTS', () => {
    // bestCp=0 → bestWin=50; altCp=0 → altWin=50; diff=0 ≤ NEAR_MISS
    const result = buildAcceptedMoves('e2e4', [{ uci: 'd2d4', cp: 0 }], 0);
    const moves = JSON.parse(result);
    expect(moves).toContain('d2d4');
  });

  it('excludes alternatives outside NEAR_MISS_WIN_PTS', () => {
    // bestCp=300 → ~72% win; altCp=-300 → ~28% win; diff > 2 pts
    const result = buildAcceptedMoves('e2e4', [{ uci: 'd2d4', cp: -300 }], 300);
    const moves = JSON.parse(result);
    expect(moves).not.toContain('d2d4');
  });

  it('skips alt lines with no uci', () => {
    const result = buildAcceptedMoves('e2e4', [{ uci: null, cp: 0 }], 0);
    const moves = JSON.parse(result);
    expect(moves).toHaveLength(1);
  });

  it('skips alt lines whose uci equals the best move', () => {
    const result = buildAcceptedMoves('e2e4', [{ uci: 'e2e4', cp: 0 }], 0);
    const moves = JSON.parse(result);
    // only one entry even though alt has same uci
    expect(moves.filter(m => m === 'e2e4')).toHaveLength(1);
  });

  it('handles null altLines gracefully', () => {
    const result = buildAcceptedMoves('e2e4', null, 100);
    const moves = JSON.parse(result);
    expect(moves).toEqual(['e2e4']);
  });

  it('covers line.cp ?? 0 null branch when cp is not provided', () => {
    // { uci: 'd2d4' } has no cp → cp ?? 0 = 0 → winPct(0) ~ 50 → within NEAR_MISS of bestCp=0
    const result = buildAcceptedMoves('e2e4', [{ uci: 'd2d4' }], 0);
    const moves = JSON.parse(result);
    expect(moves).toContain('d2d4');
  });

  it('covers bestCp ?? 0 null branch when bestCp is null', () => {
    const result = buildAcceptedMoves('e2e4', [{ uci: 'd2d4', cp: 0 }], null);
    expect(typeof result).toBe('string');
  });
});

describe('selectPuzzles sort comparator', () => {
  it('sorts 2 candidates by instructiveness descending', () => {
    const c1 = { fen: START_FEN, ply: 1, bestMoveUci: 'e2e4', moveUci: 'd2d4',
      instructiveness: 0.3, findability: FINDABILITY_MIN + 0.1, pv: null,
      cpLoss: 50, winLoss: 10, classification: 'inaccuracy', temptation: 0.2,
      maiaModel: 'maia-1300', policyTemperature: 1.0, tags: '', mover: 'player', altMovesJson: null };
    const c2 = { ...c1, fen: E4_FEN, instructiveness: 0.8 };
    const result = selectPuzzles([c1, c2]);
    expect(result[0].instructiveness).toBe(0.8);
  });

  it('covers null instructiveness in sort (instructiveness ?? 0)', () => {
    const c1 = { fen: START_FEN, ply: 1, bestMoveUci: 'e2e4', moveUci: 'd2d4',
      instructiveness: null, findability: FINDABILITY_MIN + 0.1, pv: null,
      cpLoss: 50, winLoss: 10, classification: 'inaccuracy', temptation: 0.2,
      maiaModel: 'maia-1300', policyTemperature: 1.0, tags: '', mover: 'player', altMovesJson: null };
    const c2 = { ...c1, fen: E4_FEN, instructiveness: 0.5 };
    const result = selectPuzzles([c1, c2]);
    expect(result.length).toBe(2);
  });
});

describe('derivePhase — direct tests', () => {
  it('classifies opening from START_FEN', () => {
    const phase = derivePhase({ fen: START_FEN, ply: 1 });
    expect(phase).toBe('opening');
  });

  it('classifies endgame from bare-kings FEN', () => {
    // Very few pieces → endgame
    const phase = derivePhase({ fen: '8/8/8/8/8/8/8/k6K w - - 0 1', ply: 40 });
    expect(phase).toBe('endgame');
  });
});

