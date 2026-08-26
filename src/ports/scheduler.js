/**
 * @module ports/scheduler
 * Scheduler port — FSRS spaced repetition scheduling.
 * Two implementations: FsrsScheduler (production) and FakeScheduler (tests).
 */

/**
 * @typedef {'Again'|'Hard'|'Good'|'Easy'} Rating
 */

/**
 * @typedef {Object} ScheduleResult
 * @property {Date} due
 * @property {number} stability
 * @property {number} difficulty
 * @property {number} scheduledDays
 * @property {number} elapsed_days
 * @property {number} reps
 * @property {number} lapses
 * @property {string} state
 */

/**
 * @interface Scheduler
 */

/**
 * @function
 * @name Scheduler#schedule
 * @param {Object} card - current FSRS card state
 * @param {Rating} rating
 * @param {Date} now
 * @returns {ScheduleResult}
 */

/**
 * @function
 * @name Scheduler#newCard
 * @param {Date} due
 * @returns {Object} initial card state
 */
