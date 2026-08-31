/**
 * @module tests/unit/motif-classifier
 * TDD tests for the motif classifier — must pass before implementation is complete.
 */
import { describe, it, expect } from 'vitest';

import { classifyMotif } from '../../src/domain/analysis/motif-classifier.js';

describe('classifyMotif', () => {
  it('returns null for null inputs', () => {
    expect(classifyMotif(null, null, null)).toBe(null);
    expect(classifyMotif('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', null, 'white')).toBe(null);
    expect(classifyMotif(null, 'e2e4', null)).toBe(null);
  });

  it('returns null for an illegal move', () => {
    expect(classifyMotif('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e5', 'white')).toBe(null);
  });

  it('returns null for a normal opening move', () => {
    // e2e4 in starting position — no pieces hanging, no fork
    expect(classifyMotif('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4', 'white')).toBe(null);
  });

  it('detects hanging_piece — knight moves to attacked, undefended square', () => {
    // White knight on f3, black pawn on h6 that attacks g5. Knight moves to g5.
    // After Nf3-g5, white knight on g5 is attacked by h6-pawn and has no defenders.
    const fen = '4k3/8/7p/8/8/5N2/8/4K3 w - - 0 1';
    expect(classifyMotif(fen, 'f3g5', 'white')).toBe('hanging_piece');
  });

  it('detects hanging_piece — removing the only defender exposes a piece', () => {
    // White: Re1 defends Qe6. Black Bc8 attacks Qe6. White plays Re1-d1, undefending Qe6.
    // After Rd1, the queen on e6 is attacked by Bc8 with no defenders.
    const fen = '2bk4/8/4Q3/8/8/8/8/4RK2 w - - 0 1';
    expect(classifyMotif(fen, 'e1d1', 'white')).toBe('hanging_piece');
  });

  it('detects fork — opponent knight forks two valuable white pieces', () => {
    // White: Qd7, Rf7, Ke6. Black: Ne5 (attacks d7 and f7 — both ≥ knight value).
    // White Ke6 defends both d7 and f7 so neither is individually hanging.
    // After white plays h2h4, black Ne5 forks Qd7 and Rf7.
    const fen = '4k3/3Q1R2/4K3/4n3/8/8/7P/8 w - - 0 1';
    expect(classifyMotif(fen, 'h2h4', 'white')).toBe('fork');
  });

  it('returns null when no motif is detectable', () => {
    // A quiet position with no piece under attack after the move
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    expect(classifyMotif(fen, 'e2e4', 'white')).toBe(null);
  });
});
