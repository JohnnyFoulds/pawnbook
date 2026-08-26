/**
 * @module adapters/clock/system-clock
 * Production clock — delegates to Date.now().
 */

export class SystemClock {
  now() {
    return new Date();
  }
}
