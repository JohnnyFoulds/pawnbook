import { describe, it, expect } from 'vitest';

import { derivePhase } from '../../src/domain/puzzles/select.js';

describe('phase', () => {
  it('a queenless position on ply 28 is endgame, not middlegame', () => {
    // No queens, total minor material low — endgame
    // FEN: 4k3/8/8/8/8/8/8/4K3 w - - 0 28 (bare kings, ply 55 = move 28)
    const result = derivePhase({
      fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 28',
      ply: 55,
    });
    expect(result).toBe('endgame');
  });

  it('a full-material position on ply 60 is middlegame, not endgame', () => {
    // Starting material but late ply — still middlegame
    const result = derivePhase({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      ply: 60,
    });
    expect(result).toBe('middlegame');
  });

  it('ply <= 20 with castling rights available is opening', () => {
    // After e4 e5 Nf3 — ply 5, castling rights still intact
    const result = derivePhase({
      fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      ply: 5,
    });
    expect(result).toBe('opening');
  });
});
