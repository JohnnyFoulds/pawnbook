/**
 * @module adapters/scheduler/manual-timer
 * Test implementation of the Scheduler port. Stores pending callbacks and
 * allows the caller to fire or discard them explicitly — no real wall-clock
 * delay ever runs.
 *
 * Usage in journey tests / unit tests:
 *   const timer = new ManualTimer();
 *   // ... send moves that trigger an alert timeout ...
 *   timer.fireAll();   // fire every pending timeout immediately
 *   timer.fire(handle); // fire a specific one
 */

export class ManualTimer {
  constructor() {
    /** @type {Map<number, Function>} */
    this._pending = new Map();
    this._nextId = 1;
  }

  /** @param {Function} fn @param {number} _delayMs @returns {number} handle */
  schedule(fn, _delayMs) {
    const id = this._nextId++;
    this._pending.set(id, fn);
    return id;
  }

  /** @param {number} handle */
  cancel(handle) { this._pending.delete(handle); }

  /** Fire a specific pending timeout. No-op if the handle was already cancelled. */
  fire(handle) {
    const fn = this._pending.get(handle);
    if (fn) {
      this._pending.delete(handle);
      fn();
    }
  }

  /** Fire all pending timeouts in insertion order. */
  fireAll() {
    for (const [id, fn] of this._pending) {
      this._pending.delete(id);
      fn();
    }
  }

  /** How many timeouts are currently pending. */
  get pendingCount() { return this._pending.size; }
}
