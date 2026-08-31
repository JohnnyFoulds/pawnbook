/**
 * TDD tests for pickFocusMotif — priority recommendation from motif data.
 */

import { describe, it, expect } from 'vitest';

describe('pickFocusMotif', () => {
  it('returns null for empty breakdown', async () => {
    const { pickFocusMotif } = await import('../../src/domain/review/focus.js');
    expect(pickFocusMotif({}, {})).toBeNull();
  });

  it('returns the sole motif when only one exists', async () => {
    const { pickFocusMotif } = await import('../../src/domain/review/focus.js');
    const result = pickFocusMotif({ fork: 3 }, {});
    expect(result.tag).toBe('fork');
    expect(result.mistakes).toBe(3);
    expect(result.accuracy).toBeNull();
  });

  it('picks motif with highest mistakes × (1 − accuracy) score', async () => {
    const { pickFocusMotif } = await import('../../src/domain/review/focus.js');
    const breakdown = { fork: 5, hanging_piece: 3 };
    const accuracy = {
      fork:          { total: 10, correct: 8 }, // 80% → score 5*0.2 = 1.0
      hanging_piece: { total:  5, correct: 1 }, // 20% → score 3*0.8 = 2.4
    };
    const result = pickFocusMotif(breakdown, accuracy);
    expect(result.tag).toBe('hanging_piece');
    expect(result.accuracy).toBe(20);
  });

  it('treats motifs with no drill history as 0% accuracy', async () => {
    const { pickFocusMotif } = await import('../../src/domain/review/focus.js');
    // fork: 5*(1-0)=5; pinned_piece: 2*(1-0)=2 → fork wins
    const result = pickFocusMotif({ fork: 5, pinned_piece: 2 }, {});
    expect(result.tag).toBe('fork');
    expect(result.accuracy).toBeNull();
  });

  it('returns accuracy as integer percentage when drill history exists', async () => {
    const { pickFocusMotif } = await import('../../src/domain/review/focus.js');
    const result = pickFocusMotif(
      { back_rank: 4 },
      { back_rank: { total: 8, correct: 6 } },
    );
    expect(result.accuracy).toBe(75);
    expect(result.mistakes).toBe(4);
  });
});
