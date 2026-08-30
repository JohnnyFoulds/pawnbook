/**
 * @module adapters/ids/sequential-ids
 * Test IdGenerator: returns 'id-1', 'id-2', … in order.
 * Deterministic — same sequence every run from the same starting counter.
 * Required for invariant 13 (byte-identical exports at the same book_version).
 */

export class SequentialIds {
  /** @param {string} [prefix='id'] @param {number} [start=1] */
  constructor(prefix = 'id', start = 1) {
    this._prefix = prefix;
    this._counter = start;
  }

  /** @returns {string} */
  next() { return `${this._prefix}-${this._counter++}`; }

  /** Reset counter to its initial value (between test cases). */
  reset(start = 1) { this._counter = start; }
}
