/**
 * @module ports/clock
 * Clock port — abstracts wall time so FSRS due-date arithmetic and
 * the 6s/25s rating thresholds are deterministic in tests.
 *
 * Two implementations: SystemClock (production) and FixedClock (tests).
 */

/**
 * @interface Clock
 */

/**
 * @function
 * @name Clock#now
 * @returns {Date}
 */
