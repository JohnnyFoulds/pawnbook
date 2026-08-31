/**
 * @module tests/unit/motif-dimension
 * TDD tests for MOTIF_DIMENSION map and dimensionBreakdown stats aggregation.
 */
import { describe, it, expect } from 'vitest';

import { MOTIF_DIMENSION } from '../../src/domain/analysis/motif-classifier.js';

describe('MOTIF_DIMENSION', () => {
  it('maps hanging_piece to tactics', () => {
    expect(MOTIF_DIMENSION.hanging_piece).toBe('tactics');
  });

  it('maps fork to tactics', () => {
    expect(MOTIF_DIMENSION.fork).toBe('tactics');
  });

  it('maps missed_capture to tactics', () => {
    expect(MOTIF_DIMENSION.missed_capture).toBe('tactics');
  });

  it('maps back_rank to defense', () => {
    expect(MOTIF_DIMENSION.back_rank).toBe('defense');
  });

  it('covers every known motif tag (no unmapped motif)', () => {
    const known = ['hanging_piece', 'fork', 'missed_capture', 'back_rank'];
    for (const tag of known) {
      expect(MOTIF_DIMENSION[tag]).toBeDefined();
    }
  });
});

describe('dimensionBreakdown in stats', () => {
  it('is derived from motifBreakdown via MOTIF_DIMENSION', () => {
    const motifBreakdown = { hanging_piece: 3, fork: 2, back_rank: 1 };
    const result = {};
    for (const [tag, n] of Object.entries(motifBreakdown)) {
      const dim = MOTIF_DIMENSION[tag];
      if (dim) result[dim] = (result[dim] || 0) + n;
    }
    expect(result).toEqual({ tactics: 5, defense: 1 });
  });

  it('ignores unknown tags gracefully', () => {
    const motifBreakdown = { hanging_piece: 2, unknown_tag: 1 };
    const result = {};
    for (const [tag, n] of Object.entries(motifBreakdown)) {
      const dim = MOTIF_DIMENSION[tag];
      if (dim) result[dim] = (result[dim] || 0) + n;
    }
    expect(result).toEqual({ tactics: 2 });
  });

  it('produces empty object when no motifs are tagged', () => {
    const result = {};
    for (const [tag, n] of Object.entries({})) {
      const dim = MOTIF_DIMENSION[tag];
      if (dim) result[dim] = (result[dim] || 0) + n;
    }
    expect(result).toEqual({});
  });
});
