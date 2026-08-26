/**
 * @module adapters/clock/fixed-clock
 * Deterministic clock for tests — always returns the same Date.
 */

export class FixedClock {
  /** @param {number|Date} ts — epoch ms or Date */
  constructor(ts) {
    this._ts = ts instanceof Date ? ts.getTime() : ts;
  }

  /** @returns {Date} */
  now() {
    return new Date(this._ts);
  }

  /** @param {number} ms — advance the clock by this many milliseconds */
  advance(ms) {
    this._ts += ms;
  }
}
