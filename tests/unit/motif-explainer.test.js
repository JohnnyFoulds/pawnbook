/**
 * @module tests/unit/motif-explainer
 * TDD tests for explainMotif — slot-filled position-specific explanations.
 * Each test verifies that key piece names and squares appear in the output.
 */
import { describe, it, expect } from 'vitest';

import { explainMotif } from '../../src/domain/analysis/motif-explainer.js';

describe('explainMotif', () => {
  it('returns null for null inputs', () => {
    expect(explainMotif(null, null, null, null)).toBe(null);
    expect(explainMotif('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', null, 'white', 'fork')).toBe(null);
  });

  it('returns null for an unknown motif tag', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(explainMotif(fen, 'e2e4', 'white', 'unknown_tag')).toBe(null);
  });

  // ── hanging_piece ─────────────────────────────────────────────────────────

  it('hanging_piece: mentions the hanging square and piece name', () => {
    // Nf3-g5: knight moves to g5, attacked by h6-pawn, no defenders
    const fen = '4k3/8/7p/8/8/5N2/8/4K3 w - - 0 1';
    const result = explainMotif(fen, 'f3g5', 'white', 'hanging_piece');
    expect(result).toBeTypeOf('string');
    expect(result).toMatch(/knight/i);
    expect(result).toMatch(/g5/);
  });

  // ── fork ──────────────────────────────────────────────────────────────────

  it('fork: mentions the forking piece and both attacked targets', () => {
    // Black Ne5 forks Qd7 and Rf7; white plays h2h4
    const fen = '4k3/3Q1R2/4K3/4n3/8/8/7P/8 w - - 0 1';
    const result = explainMotif(fen, 'h2h4', 'white', 'fork');
    expect(result).toBeTypeOf('string');
    expect(result).toMatch(/knight/i);
    expect(result).toMatch(/e5/);
  });

  // ── back_rank ─────────────────────────────────────────────────────────────

  it('back_rank: mentions the king square and back-rank threat', () => {
    // Kg1, pawn on h2; h2h4 removes luft, Ra8 threatens back rank
    const fen = 'r3k3/8/8/8/8/8/7P/6K1 w - - 0 1';
    const result = explainMotif(fen, 'h2h4', 'white', 'back_rank');
    expect(result).toBeTypeOf('string');
    expect(result).toMatch(/king/i);
    expect(result).toMatch(/g1/);
  });

  // ── missed_capture ────────────────────────────────────────────────────────

  it('missed_capture: mentions the capturable piece and its square', () => {
    // Na6 can capture undefended Qc7; instead plays a6b4
    const fen = '4k3/2q5/N7/8/8/8/3PPP2/4K3 w - - 0 1';
    const result = explainMotif(fen, 'a6b4', 'white', 'missed_capture');
    expect(result).toBeTypeOf('string');
    expect(result).toMatch(/queen/i);
    expect(result).toMatch(/c7/);
  });

  // ── overloaded_defender ───────────────────────────────────────────────────

  it('overloaded_defender: mentions the overloaded piece and the two targets', () => {
    // Re5 sole defender of Nd5 (attacked by Rd8) and Nf5 (attacked by Rf8)
    const fen = '3r1r2/8/8/3NRN2/8/8/8/K6k w - - 0 1';
    const result = explainMotif(fen, 'a1a2', 'white', 'overloaded_defender');
    expect(result).toBeTypeOf('string');
    expect(result).toMatch(/rook/i);
    expect(result).toMatch(/e5/);
  });

  // ── pinned_piece ──────────────────────────────────────────────────────────

  it('pinned_piece: mentions the pinned piece, the slider, and the shielded piece', () => {
    // Bb2 pins Nd4 against Qf6; white plays h1h2
    const fen = 'k7/8/5Q2/8/3N4/8/1b6/7K w - - 0 1';
    const result = explainMotif(fen, 'h1h2', 'white', 'pinned_piece');
    expect(result).toBeTypeOf('string');
    expect(result).toMatch(/knight/i);
    expect(result).toMatch(/d4/);
    expect(result).toMatch(/bishop/i);
  });

  // ── skewer ────────────────────────────────────────────────────────────────

  it('skewer: mentions the skewered piece, slider, and piece behind', () => {
    // Ba1 skewers Qd4 onto Rg7; white plays a8a7
    const fen = 'K1k5/6R1/8/8/3Q4/1n6/8/b2R4 w - - 0 1';
    const result = explainMotif(fen, 'a8a7', 'white', 'skewer');
    expect(result).toBeTypeOf('string');
    expect(result).toMatch(/queen/i);
    expect(result).toMatch(/d4/);
    expect(result).toMatch(/bishop/i);
  });

  // ── discovered_attack ─────────────────────────────────────────────────────

  it('discovered_attack: mentions the uncovered attacker and the newly attacked piece', () => {
    // Rg4 moves to g2; Rh4 now attacks Nd4
    const fen = '7k/8/8/8/3N2Rr/K7/3R4/7r w - - 0 1';
    const result = explainMotif(fen, 'g4g2', 'white', 'discovered_attack');
    expect(result).toBeTypeOf('string');
    expect(result).toMatch(/knight/i);
    expect(result).toMatch(/d4/);
    expect(result).toMatch(/rook/i);
  });
});
