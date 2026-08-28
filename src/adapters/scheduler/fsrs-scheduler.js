/**
 * @module adapters/scheduler/fsrs-scheduler
 * FSRS scheduler using ts-fsrs. Implements the Scheduler port.
 *
 * ts-fsrs uses snake_case field names and Date objects internally.
 * This adapter translates between that format and the camelCase/timestamp
 * format used by saveCard / getCard throughout the rest of the codebase.
 */

import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';

const RATING_MAP = {
  'Again': Rating.Again,
  'Hard':  Rating.Hard,
  'Good':  Rating.Good,
  'Easy':  Rating.Easy,
};

function toDate(v) {
  if (!v) return undefined;
  return v instanceof Date ? v : new Date(v);
}

function toMs(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return new Date(v).getTime();
}

export class FsrsScheduler {
  constructor(opts = {}) {
    const params = generatorParameters({ request_retention: opts.targetRetention ?? 0.90 });
    this._f = fsrs(params);
  }

  /**
   * Create a new FSRS card for a puzzle.
   * @returns {object} card state (due = tomorrow, state = New)
   */
  newCard() {
    return createEmptyCard();
  }

  /**
   * Schedule a card after a review.
   * @param {object} card — current fsrs_cards state (camelCase, timestamps as ms)
   * @param {string} rating — 'Again' | 'Hard' | 'Good' | 'Easy'
   * @param {Date} [reviewedAt]
   * @returns {{ card: object, log: object }}
   */
  schedule(card, rating, reviewedAt = new Date()) {
    const fsrsRating = RATING_MAP[rating];
    if (fsrsRating === undefined) throw new Error(`Unknown rating: ${rating}`);

    // Map our camelCase/timestamp format → ts-fsrs snake_case/Date format
    const input = {
      due: toDate(card.due) ?? new Date(),
      stability: card.stability ?? 0,
      difficulty: card.difficulty ?? 0,
      elapsed_days: card.elapsedDays ?? card.elapsed_days ?? 0,
      scheduled_days: card.scheduledDays ?? card.scheduled_days ?? 0,
      reps: card.reps ?? 0,
      lapses: card.lapses ?? 0,
      state: Number(card.state ?? 0),
      last_review: toDate(card.lastReview ?? card.last_review),
    };

    const result = this._f.next(input, reviewedAt, fsrsRating);
    const c = result.card;

    // Map ts-fsrs snake_case/Date format → our camelCase/timestamp format
    return {
      card: {
        due: toMs(c.due),
        stability: c.stability,
        difficulty: c.difficulty,
        elapsedDays: c.elapsed_days,
        scheduledDays: c.scheduled_days,
        reps: c.reps,
        lapses: c.lapses,
        state: c.state,
        lastReview: toMs(c.last_review),
        graduated: 0,
      },
      log: result.log,
    };
  }
}
