/**
 * @module adapters/scheduler/fsrs-scheduler
 * FSRS scheduler using ts-fsrs. Implements the Scheduler port.
 */

import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';

const RATING_MAP = {
  'Again': Rating.Again,
  'Hard':  Rating.Hard,
  'Good':  Rating.Good,
  'Easy':  Rating.Easy,
};

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
   * @param {object} card — current fsrs_cards state
   * @param {string} rating — 'Again' | 'Hard' | 'Good' | 'Easy'
   * @param {Date} [reviewedAt]
   * @returns {{ card: object, log: object }}
   */
  schedule(card, rating, reviewedAt = new Date()) {
    const fsrsRating = RATING_MAP[rating];
    if (fsrsRating === undefined) throw new Error(`Unknown rating: ${rating}`);
    const result = this._f.next(card, reviewedAt, fsrsRating);
    return { card: result.card, log: result.log };
  }
}
