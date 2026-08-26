import { describe, it, expect } from 'vitest';

import { SystemClock } from '../../src/adapters/clock/system-clock.js';
import { FixedClock } from '../../src/adapters/clock/fixed-clock.js';

describe('SystemClock', () => {
  it('now() returns a Date', () => {
    const clock = new SystemClock();
    const now = clock.now();
    expect(now instanceof Date).toBe(true);
  });

  it('now() returns a recent timestamp', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const now = clock.now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe('FixedClock', () => {
  it('now() returns the fixed timestamp as a Date', () => {
    const ts = 1_000_000;
    const clock = new FixedClock(ts);
    expect(clock.now().getTime()).toBe(ts);
  });

  it('accepts a Date object in constructor', () => {
    const d = new Date(2025, 0, 1);
    const clock = new FixedClock(d);
    expect(clock.now().getTime()).toBe(d.getTime());
  });

  it('advance() moves the clock forward', () => {
    const clock = new FixedClock(1_000_000);
    clock.advance(5000);
    expect(clock.now().getTime()).toBe(1_005_000);
  });
});
