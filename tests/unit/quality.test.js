import { describe, it, expect } from 'vitest';

import { QUALITY, GLYPH_TIERS, tierFor } from '../../src/shared/quality.js';

describe('quality', () => {
  it('every tier maps to exactly one glyph and one hex', () => {
    for (const [, tier] of Object.entries(QUALITY)) {
      expect(typeof tier.hex).toBe('string');
      expect(tier.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof tier.label).toBe('string');
      // glyph is string or null
      expect(tier.glyph === null || typeof tier.glyph === 'string').toBe(true);
    }
  });

  it('only the three negative glyph tiers are in GLYPH_TIERS', () => {
    expect(GLYPH_TIERS).toHaveLength(3);
    expect(GLYPH_TIERS).toContain('blunder');
    expect(GLYPH_TIERS).toContain('mistake');
    expect(GLYPH_TIERS).toContain('inaccuracy');
  });

  it('positive tiers and ok/good are not in GLYPH_TIERS', () => {
    expect(GLYPH_TIERS).not.toContain('ok');
    expect(GLYPH_TIERS).not.toContain('good');
    expect(GLYPH_TIERS).not.toContain('great');
    expect(GLYPH_TIERS).not.toContain('best');
  });

  it('tierFor returns the correct tier for a known classification', () => {
    expect(tierFor('blunder')).toBe(QUALITY.blunder);
    expect(tierFor('best')).toBe(QUALITY.best);
  });

  it('tierFor falls back to OK for unknown classification', () => {
    expect(tierFor('unknown')).toBe(QUALITY.ok);
    expect(tierFor(undefined)).toBe(QUALITY.ok);
  });
});
