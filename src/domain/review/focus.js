/**
 * @module domain/review/focus
 * Selects the single highest-priority motif for focused drilling.
 * Priority = mistakes × (1 − drillAccuracy). Lower accuracy and more mistakes both increase priority.
 */

/**
 * @param {Object<string, number>} motifBreakdown  — motifTag → mistake count
 * @param {Object<string, {total: number, correct: number}>} motifAccuracy — motifTag → drill stats
 * @returns {{ tag: string, mistakes: number, accuracy: number|null }|null}
 */
export function pickFocusMotif(motifBreakdown, motifAccuracy) {
  let best = null;
  let bestScore = -1;
  for (const [tag, mistakes] of Object.entries(motifBreakdown)) {
    const acc = motifAccuracy[tag];
    const rate = acc && acc.total > 0 ? acc.correct / acc.total : 0;
    const score = mistakes * (1 - rate);
    if (score > bestScore) {
      bestScore = score;
      best = {
        tag,
        mistakes,
        accuracy: acc && acc.total > 0 ? Math.round(rate * 100) : null,
      };
    }
  }
  return best;
}
