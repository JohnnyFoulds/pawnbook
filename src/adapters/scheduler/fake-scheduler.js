/**
 * @module adapters/scheduler/fake-scheduler
 * Deterministic scheduler for testing. Records calls; does not use ts-fsrs.
 */

export class FakeScheduler {
  constructor() {
    this._calls = [];
    this._nextDue = null; // override for assertions
  }

  newCard() {
    const tomorrow = new Date(Date.now() + 86_400_000);
    return {
      due: tomorrow,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0, // New
      last_review: null,
    };
  }

  /**
   * @param {object} card
   * @param {string} rating
   * @param {Date} [reviewedAt]
   */
  schedule(card, rating, reviewedAt = new Date()) {
    this._calls.push({ card, rating, reviewedAt });

    const intervalDays = { Again: 0, Hard: 1, Good: 3, Easy: 7 }[rating] ?? 1;
    const due = new Date(reviewedAt.getTime() + intervalDays * 86_400_000);

    const newCard = {
      ...card,
      due: this._nextDue ?? due,
      reps: (card.reps ?? 0) + 1,
      lapses: rating === 'Again' ? (card.lapses ?? 0) + 1 : (card.lapses ?? 0),
      scheduled_days: intervalDays,
      last_review: reviewedAt,
    };

    return { card: newCard, log: { rating, scheduled_days: intervalDays } };
  }

  /** @returns {object[]} */
  get calls() { return this._calls; }
}
