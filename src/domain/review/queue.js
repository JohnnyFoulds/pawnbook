/**
 * @module domain/review/queue
 * Due-card queue management: soft cap, graduation, ordering.
 */

import { DUE_SOFT_CAP, GRADUATE_REPS, GRADUATE_INTERVAL_D } from '../../shared/balance.js';
import { MOTIF_DIMENSION } from '../analysis/motif-classifier.js';

/**
 * Check whether a card qualifies for graduation (retirement from active queue).
 * @param {object} card — fsrs_cards row
 * @returns {boolean}
 */
export function shouldGraduate(card) {
  if (!card) return false;
  const reps = card.reps ?? 0;
  const lapses = card.lapses ?? 0;
  const scheduledDays = card.scheduled_days ?? card.scheduledDays ?? 0;
  return reps >= GRADUATE_REPS && lapses === 0 && scheduledDays > GRADUATE_INTERVAL_D;
}

/**
 * Apply the due-soft-cap display logic.
 * @param {number} dueCount
 * @returns {{ display: string, overCap: boolean }}
 */
export function formatDueCount(dueCount) {
  if (dueCount > DUE_SOFT_CAP) {
    return { display: `${DUE_SOFT_CAP}+`, overCap: true };
  }
  return { display: String(dueCount), overCap: false };
}

/**
 * Sort due cards: when over the soft cap, sort by instructiveness × overdue-factor,
 * otherwise by due date ascending. An optional weakDimension boosts matching tactical
 * cards to the front of the tactical group so the player drills their known weak area first.
 *
 * @param {object[]} cards — joined puzzle + fsrs_cards rows
 * @param {Date} now
 * @param {string|null} [weakDimension] — e.g. 'tactics' or 'defense'
 * @returns {object[]}
 */
export function sortDueCards(cards, now = new Date(), weakDimension = null) {
  if (cards.length <= DUE_SOFT_CAP) {
    return cards.slice().sort((a, b) => {
      const da = new Date(a.due).getTime();
      const db = new Date(b.due).getTime();
      return da - db;
    });
  }

  const nowMs = now.getTime();
  return cards.slice().sort((a, b) => {
    // Opening cards always sort before tactical when over the soft cap
    const kindA = a.kind ?? 'tactical';
    const kindB = b.kind ?? 'tactical';
    if (kindA === 'opening' && kindB !== 'opening') return -1;
    if (kindA !== 'opening' && kindB === 'opening') return 1;

    // Within the opening group, sort by reach probability descending (FR-REP-DRILL-5);
    // fall through to instructiveness × overdue tiebreak when reach is equal or unknown.
    if (kindA === 'opening' && kindB === 'opening') {
      const reachDiff = (b.reachProb ?? 0) - (a.reachProb ?? 0);
      if (reachDiff !== 0) return reachDiff;
    }

    // Within the tactical group, boost cards matching the player's weakest dimension
    if (weakDimension && kindA === 'tactical' && kindB === 'tactical') {
      const aWeak = MOTIF_DIMENSION[a.motif_tag ?? a.motifTag] === weakDimension;
      const bWeak = MOTIF_DIMENSION[b.motif_tag ?? b.motifTag] === weakDimension;
      if (aWeak !== bWeak) return aWeak ? -1 : 1;
    }

    const overdueFactor = (card) => {
      const dueMs = new Date(card.due).getTime();
      const overdueMs = Math.max(0, nowMs - dueMs);
      return 1 + overdueMs / (24 * 60 * 60 * 1000); // days overdue + 1
    };
    const scoreA = (a.instructiveness ?? 0) * overdueFactor(a);
    const scoreB = (b.instructiveness ?? 0) * overdueFactor(b);
    return scoreB - scoreA;
  });
}
