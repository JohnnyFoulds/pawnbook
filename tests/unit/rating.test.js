import { describe, it, expect } from 'vitest';

import { inferRating } from '../../src/domain/review/rating.js';
import { RATING_FAST_MS, RATING_SLOW_MS } from '../../src/shared/balance.js';

describe('rating', () => {
  it('wrong infers Again', () => {
    expect(inferRating({ correct: false, hintUsed: false, msTaken: 5000 })).toBe('Again');
  });

  it('hint used infers Again even when correct', () => {
    expect(inferRating({ correct: true, hintUsed: true, msTaken: 5000 })).toBe('Again');
  });

  it('correct over RATING_SLOW_MS infers Hard', () => {
    expect(inferRating({ correct: true, hintUsed: false, msTaken: RATING_SLOW_MS + 1 })).toBe('Hard');
  });

  it('correct within RATING_SLOW_MS infers Good', () => {
    expect(inferRating({ correct: true, hintUsed: false, msTaken: RATING_SLOW_MS - 1 })).toBe('Good');
  });

  it('correct under RATING_FAST_MS infers Easy', () => {
    expect(inferRating({ correct: true, hintUsed: false, msTaken: RATING_FAST_MS - 1 })).toBe('Easy');
  });

  it('a retry (attemptNo=2) succeeding still infers Again', () => {
    expect(inferRating({ correct: true, hintUsed: false, msTaken: 3000, attemptNo: 2 })).toBe('Again');
  });

  it('wrong follow-up after correct first move infers Hard', () => {
    expect(inferRating({ correct: true, hintUsed: false, msTaken: 3000, followupCorrect: false })).toBe('Hard');
  });

  it('wrong follow-up never infers Again', () => {
    const r = inferRating({ correct: true, hintUsed: false, msTaken: 3000, followupCorrect: false });
    expect(r).not.toBe('Again');
  });

  it('wrong follow-up never infers Easy', () => {
    const r = inferRating({ correct: true, hintUsed: false, msTaken: 1000, followupCorrect: false });
    expect(r).not.toBe('Easy');
  });

  it('correct fast with no follow-up (null) still infers Easy', () => {
    expect(inferRating({ correct: true, hintUsed: false, msTaken: RATING_FAST_MS - 1, followupCorrect: null })).toBe('Easy');
  });

  it('correct fast with correct follow-up infers Easy', () => {
    expect(inferRating({ correct: true, hintUsed: false, msTaken: RATING_FAST_MS - 1, followupCorrect: true })).toBe('Easy');
  });
});
