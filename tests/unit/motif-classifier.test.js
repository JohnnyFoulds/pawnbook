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

  // ── missed_capture ────────────────────────────────────────────────────────

  it('detects missed_capture — undefended opponent piece left on the board', () => {
    // White Na6 attacks undefended Qc7; white plays a6b4 instead of taking it.
    // King has luft (d2,e2,f2 pawns) so back_rank does not fire first.
    const fen = '4k3/2q5/N7/8/8/8/3PPP2/4K3 w - - 0 1';
    expect(classifyMotif(fen, 'a6b4', 'white')).toBe('missed_capture');
  });

  it('missed_capture does not fire when player captures the free piece', () => {
    // Same position but white plays Na6xc7 — takes the queen — so nothing is missed.
    const fen = '4k3/2q5/N7/8/8/8/3PPP2/4K3 w - - 0 1';
    expect(classifyMotif(fen, 'a6c7', 'white')).toBe(null);
  });

  // ── overloaded_defender ───────────────────────────────────────────────────

  it('detects overloaded_defender — one piece is sole guardian of two attacked pieces', () => {
    // White Re5 defends both Nd5 (attacked by Rd8) and Nf5 (attacked by Rf8).
    // White plays Ka1-a2 (quiet king move). After the move Re5 is still the sole
    // defender of both knights → overloaded_defender.
    const fen = '3r1r2/8/8/3NRN2/8/8/8/K6k w - - 0 1';
    expect(classifyMotif(fen, 'a1a2', 'white')).toBe('overloaded_defender');
  });

  it('overloaded_defender does not fire when each threatened piece has two defenders', () => {
    // Nd5 is defended by both Rc5 and Re5 (flanking it on the 5th rank).
    // Nf5 is defended by both Re5 and Rg5. No piece is the sole guardian of any threatened
    // piece → null. White: Ka1, Rc5, Re5, Rg5, Nd5, Nf5; Black: Kh1, Rd8, Rf8.
    const fen = '3r1r2/8/8/2RNRNR1/8/8/8/K6k w - - 0 1';
    expect(classifyMotif(fen, 'a1a2', 'white')).toBe(null);
  });

  // ── pinned_piece ──────────────────────────────────────────────────────────

  it('detects pinned_piece — black bishop pins white knight against white queen', () => {
    // Black Bb2 looks along NE diagonal: c3(empty) → d4(Nd4) → e5(empty) → f6(Qf6).
    // Nd4 is pinned against Qf6 (value 9 > 3). White plays h1-h2. After move:
    // hanging_piece: Nd4 attacked by Bb2, defended by Qf6 → not hanging.
    // pinned_piece: first white on Bb2's NE ray = Nd4, second = Qf6 → fires.
    const fen = 'k7/8/5Q2/8/3N4/8/1b6/7K w - - 0 1';
    expect(classifyMotif(fen, 'h1h2', 'white')).toBe('pinned_piece');
  });

  it('pinned_piece does not fire when pieces are not aligned on a slider ray', () => {
    // White Re4 defends Nd4 (prevents hanging_piece). Qf5 is NOT on Bb2\'s NE diagonal,
    // so no pin exists. White plays h1-h2 → null.
    const fen = 'k7/8/8/5Q2/3NR3/8/1b6/7K w - - 0 1';
    expect(classifyMotif(fen, 'h1h2', 'white')).toBe(null);
  });

  // ── discovered_attack ─────────────────────────────────────────────────────

  it('detects discovered_attack — moving a rook uncovers a slider attack on a defended knight', () => {
    // White Rg4 blocks Black Rh4 from attacking White Nd4.
    // White plays Rg4-g2 (moves off the rank-4 ray). Now Rh4 attacks Nd4, which
    // was not attacked before the move. Nd4 is defended by Rd2 so not hanging.
    const fen = '7k/8/8/8/3N2Rr/K7/3R4/7r w - - 0 1';
    expect(classifyMotif(fen, 'g4g2', 'white')).toBe('discovered_attack');
  });

  it('discovered_attack does not fire when no piece becomes newly attacked', () => {
    // White pawns on f2/g2/h2 shield from Bh4. Ke1-e2 does not uncover any new attack.
    const fen = 'k7/8/8/8/7b/8/5PPP/4K3 w - - 0 1';
    expect(classifyMotif(fen, 'e1e2', 'white')).toBe(null);
  });

  // ── skewer ────────────────────────────────────────────────────────────────

  it('detects skewer — black bishop skewers white queen onto white rook behind', () => {
    // Black Ba1 NE diagonal: d4(Qd4, val 9) → g7(Rg7, val 5).
    // 9 > 5 → skewer (queen must move, rook behind is captured).
    // Qd4 defended by Rd1 (not hanging). Nb3 defends Ba1 (no missed_capture).
    const fen = 'K1k5/6R1/8/8/3Q4/1n6/8/b2R4 w - - 0 1';
    expect(classifyMotif(fen, 'a8a7', 'white')).toBe('skewer');
  });

  it('skewer does not fire when second piece is more valuable than first (that is a pin)', () => {
    // Black Ba1 NE diagonal: f3(Nf3, val 3) → h5(Qh5, val 9). 9 > 3 → pin, not skewer.
    // Nf3 defended by Ka2 (adjacent). White plays a quiet king move.
    const fen = 'k7/8/8/8/7b/8/5PPP/4K3 w - - 0 1';
    expect(classifyMotif(fen, 'e1e2', 'white')).toBe(null);
  });

  // ── back_rank ─────────────────────────────────────────────────────────────

  it('detects back_rank — king on back rank loses luft pawn, opponent has rook', () => {
    // White king g1, only pawn h2 left as luft. White plays h2h4 (removes the pawn).
    // After h4: f2,g2,h2 all empty → no luft; black rook a8 present → back_rank.
    const fen = 'r3k3/8/8/8/8/8/7P/6K1 w - - 0 1';
    expect(classifyMotif(fen, 'h2h4', 'white')).toBe('back_rank');
  });

  it('back_rank does not fire when king has pawn cover', () => {
    // White king g1, pawns f2,g2,h2 all intact. White plays Nf3-e5 (not touching pawns).
    // After Ne5: g2 still there → king has luft → no back_rank.
    const fen = 'r3k3/8/8/8/8/5N2/5PPP/6K1 w - - 0 1';
    expect(classifyMotif(fen, 'f3e5', 'white')).toBe(null);
  });
});
