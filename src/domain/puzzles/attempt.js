/**
 * @module domain/puzzles/attempt
 * Server-side attempt grading: checks whether a move is correct and infers
 * the FSRS rating. The client submits behaviour; the server derives everything.
 */

import { inferRating } from '../review/rating.js';
import { SUSPECT_RECALL_MS } from '../../shared/balance.js';

/**
 * Grade a puzzle attempt.
 *
 * @param {object} puzzle — the puzzle record from the repository
 * @param {object} attemptData
 * @param {string} attemptData.move — UCI move the player submitted
 * @param {number} attemptData.msTaken — ms from display to submission
 * @param {boolean} [attemptData.hintUsed]
 * @param {number} [attemptData.attemptNo] — 1 (first try) or 2 (retry)
 * @param {boolean} [attemptData.isPractice] — true for post-game quiz / drill-ahead
 * @param {boolean} [attemptData.isFirstSpacedReview] — true when it's the first non-practice review
 * @returns {{correct: boolean, rating: string|null, followupRequired: boolean, suspectRecall: boolean}}
 */
export function gradeAttempt(puzzle, attemptData) {
  const {
    move,
    msTaken,
    hintUsed = false,
    attemptNo = 1,
    isPractice = false,
    isFirstSpacedReview = false,
  } = attemptData;

  const accepted = parseAccepted(puzzle.acceptedMovesJson ?? puzzle.accepted_moves_json);
  const correct = accepted.includes(move);

  // Determine if a follow-up will be required (non-null followupUci in puzzle)
  const followupRequired = correct && !!(puzzle.followupUci ?? puzzle.followup_uci);

  // suspectRecall: correct first try, first spaced review, answered in under SUSPECT_RECALL_MS
  const suspectRecall = isFirstSpacedReview && correct && attemptNo === 1 && msTaken < SUSPECT_RECALL_MS;

  if (isPractice) {
    // Post-game quiz and drill-ahead: log only, no scheduler call
    return { correct, rating: null, followupRequired, suspectRecall: false };
  }

  const rating = inferRating({ correct, hintUsed, msTaken, attemptNo });

  return { correct, rating, followupRequired, suspectRecall };
}

/**
 * Grade a follow-up move.
 * @param {object} puzzle
 * @param {string} followupMove — UCI
 * @returns {boolean}
 */
export function gradeFollowup(puzzle, followupMove) {
  const followupUci = puzzle.followupUci ?? puzzle.followup_uci;
  if (!followupUci) return true; // no follow-up expected — don't penalise
  return followupMove === followupUci;
}

function parseAccepted(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [json];
  }
}
