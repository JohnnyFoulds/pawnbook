/**
 * @module shared/quality
 * Move quality tiers — glyph, hex, and label.
 * Single source for server, TUI, and browser.
 * Only the five glyph tiers are annotated in the move list;
 * all seven appear in the breakdown bar with direct text labels.
 */

/** @typedef {{ glyph: string|null, hex: string, label: string }} QualityTier */

/** @type {Record<string, QualityTier>} */
export const QUALITY = {
  blunder:    { glyph: '??', hex: '#dd7065', label: 'Blunder' },
  mistake:    { glyph: '?',  hex: '#b85a50', label: 'Mistake' },
  inaccuracy: { glyph: '?!', hex: '#8f4a45', label: 'Inaccuracy' },
  ok:         { glyph: null, hex: '#6f6f69', label: 'OK' },
  good:       { glyph: null, hex: '#256abf', label: 'Good' },
  great:      { glyph: '!',  hex: '#3987e5', label: 'Great' },
  best:       { glyph: '!!', hex: '#6da7ec', label: 'Best' },
};

/** Tiers that carry a chess glyph — the only ones annotated in the move list. */
export const GLYPH_TIERS = Object.entries(QUALITY)
  .filter(([, t]) => t.glyph !== null)
  .map(([key]) => key);

/**
 * @param {string} classification
 * @returns {QualityTier}
 */
export function tierFor(classification) {
  return QUALITY[classification] ?? QUALITY.ok;
}
