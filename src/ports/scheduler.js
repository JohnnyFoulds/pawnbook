/**
 * @module ports/scheduler
 * Scheduler port — abstracts setTimeout/clearTimeout so alert timeouts are
 * controllable in tests without waiting real wall-clock seconds.
 *
 * Two implementations:
 *   RealScheduler   — wraps the process setTimeout (production)
 *   ManualScheduler — stores pending callbacks; caller fires them explicitly
 */

/**
 * @interface Scheduler
 */

/**
 * @function
 * @name Scheduler#schedule
 * @param {Function} fn
 * @param {number} delayMs
 * @returns {*} handle (opaque; pass to cancel())
 */

/**
 * @function
 * @name Scheduler#cancel
 * @param {*} handle
 */
