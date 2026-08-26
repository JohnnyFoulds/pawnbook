/**
 * @module domain/review/rating
 * Infer FSRS rating (Again/Hard/Good/Easy) from attempt behaviour.
 * The server owns all thresholds; no client computes a rating.
 */

import { RATING_FAST_MS, RATING_SLOW_MS } from '../../shared/balance.js';

/**
 * Infer the FSRS rating for a spaced-repetition attempt.
 *
 * @param {object} opts
 * @param {boolean} opts.correct — first move was correct (or within near-miss)
 * @param {boolean} opts.hintUsed — player asked for a hint
 * @param {number} opts.msTaken — total ms from position appearing to last move submitted
 * @param {boolean|null} [opts.followupCorrect] — null = not asked (no pv follow-up)
 * @param {number} [opts.attemptNo] — 1 = first try, 2 = after one retry
 * @returns {'Again' | 'Hard' | 'Good' | 'Easy'}
 */
export function inferRating({ correct, hintUsed, msTaken, followupCorrect = null, attemptNo = 1 }) {
  // Wrong (either attempt), or hint used → Again
  if (!correct || hintUsed) return 'Again';

  // Retry succeeds → still Again (the first attempt failed)
  if (attemptNo > 1) return 'Again';

  // Correct follow-up check (when follow-up was asked)
  if (followupCorrect === false) return 'Hard'; // correct move, wrong idea

  // Timing
  if (msTaken > RATING_SLOW_MS) return 'Hard';

  // Easy: correct + correct follow-up (if asked) + under RATING_FAST_MS total
  if (msTaken < RATING_FAST_MS && (followupCorrect === true || followupCorrect === null)) {
    return 'Easy';
  }

  return 'Good';
}
