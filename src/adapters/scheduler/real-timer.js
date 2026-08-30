/**
 * @module adapters/scheduler/real-timer
 * Production implementation of the Scheduler port. Delegates to the process
 * setTimeout / clearTimeout — identical to calling them directly, but injectable.
 */

export class RealTimer {
  /** @param {Function} fn @param {number} delayMs @returns {ReturnType<typeof setTimeout>} */
  schedule(fn, delayMs) { return setTimeout(fn, delayMs); }

  /** @param {ReturnType<typeof setTimeout>} handle */
  cancel(handle) { clearTimeout(handle); }
}
