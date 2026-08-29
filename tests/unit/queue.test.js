import { describe, it, expect } from 'vitest';

import { shouldGraduate, formatDueCount, sortDueCards } from '../../src/domain/review/queue.js';
import { DUE_SOFT_CAP, GRADUATE_REPS, GRADUATE_INTERVAL_D } from '../../src/shared/balance.js';

describe('queue', () => {
  describe('shouldGraduate', () => {
    it('returns true when reps >= GRADUATE_REPS, no lapses, and interval > GRADUATE_INTERVAL_D', () => {
      const card = { reps: GRADUATE_REPS, lapses: 0, scheduled_days: GRADUATE_INTERVAL_D + 1 };
      expect(shouldGraduate(card)).toBe(true);
    });

    it('works with camelCase scheduledDays property', () => {
      const card = { reps: GRADUATE_REPS, lapses: 0, scheduledDays: GRADUATE_INTERVAL_D + 1 };
      expect(shouldGraduate(card)).toBe(true);
    });

    it('treats missing reps as 0', () => {
      const card = { lapses: 0, scheduled_days: GRADUATE_INTERVAL_D + 1 };
      expect(shouldGraduate(card)).toBe(false); // reps=0 < GRADUATE_REPS
    });

    it('returns false when reps < GRADUATE_REPS', () => {
      const card = { reps: GRADUATE_REPS - 1, lapses: 0, scheduled_days: GRADUATE_INTERVAL_D + 1 };
      expect(shouldGraduate(card)).toBe(false);
    });

    it('returns false when there are lapses', () => {
      const card = { reps: GRADUATE_REPS, lapses: 1, scheduled_days: GRADUATE_INTERVAL_D + 1 };
      expect(shouldGraduate(card)).toBe(false);
    });

    it('returns false when interval <= GRADUATE_INTERVAL_D', () => {
      const card = { reps: GRADUATE_REPS, lapses: 0, scheduled_days: GRADUATE_INTERVAL_D };
      expect(shouldGraduate(card)).toBe(false);
    });

    it('returns false for null/undefined card', () => {
      expect(shouldGraduate(null)).toBe(false);
      expect(shouldGraduate(undefined)).toBe(false);
    });

    it('card without reps field defaults to 0 (returns false)', () => {
      const card = { lapses: 0, scheduled_days: GRADUATE_INTERVAL_D + 1 };
      expect(shouldGraduate(card)).toBe(false);
    });

    it('card without lapses field defaults to 0', () => {
      const card = { reps: GRADUATE_REPS, scheduled_days: GRADUATE_INTERVAL_D + 1 };
      // lapses defaults to 0, so should graduate if other conditions met
      expect(shouldGraduate(card)).toBe(true);
    });
  });

  describe('formatDueCount', () => {
    it('returns the count as a string when at or below DUE_SOFT_CAP', () => {
      const result = formatDueCount(DUE_SOFT_CAP);
      expect(result.display).toBe(String(DUE_SOFT_CAP));
      expect(result.overCap).toBe(false);
    });

    it('returns "N+" and overCap=true when above DUE_SOFT_CAP', () => {
      const result = formatDueCount(DUE_SOFT_CAP + 1);
      expect(result.display).toBe(`${DUE_SOFT_CAP}+`);
      expect(result.overCap).toBe(true);
    });

    it('handles zero', () => {
      const result = formatDueCount(0);
      expect(result.display).toBe('0');
      expect(result.overCap).toBe(false);
    });
  });

  describe('sortDueCards', () => {
    const now = new Date('2025-01-10T12:00:00Z');

    it('returns cards sorted by due date when at or below DUE_SOFT_CAP', () => {
      const cards = [
        { due: '2025-01-09T12:00:00Z', instructiveness: 5 },
        { due: '2025-01-08T12:00:00Z', instructiveness: 3 },
        { due: '2025-01-10T12:00:00Z', instructiveness: 8 },
      ];
      const sorted = sortDueCards(cards, now);
      expect(new Date(sorted[0].due) <= new Date(sorted[1].due)).toBe(true);
      expect(new Date(sorted[1].due) <= new Date(sorted[2].due)).toBe(true);
    });

    it('when over DUE_SOFT_CAP, higher instructiveness x overdue comes first', () => {
      const cards = Array.from({ length: DUE_SOFT_CAP + 5 }, (_, i) => ({
        due: new Date(now.getTime() - i * 86_400_000).toISOString(),
        instructiveness: i % 3 === 0 ? 50 : 1,
      }));
      const sorted = sortDueCards(cards, now);
      // First card should have high instructiveness
      expect(sorted[0].instructiveness).toBe(50);
    });

    it('handles cards with missing instructiveness (defaults to 0)', () => {
      const cards = Array.from({ length: DUE_SOFT_CAP + 2 }, (_, i) => ({
        due: new Date(now.getTime() - i * 86_400_000).toISOString(),
        // no instructiveness field
      }));
      expect(() => sortDueCards(cards, now)).not.toThrow();
    });

    it('returns empty array for empty input', () => {
      expect(sortDueCards([], now)).toEqual([]);
    });

    it('opening cards sort before tactical when over DUE_SOFT_CAP', () => {
      const base = new Date('2025-01-10T00:00:00Z').getTime();
      const cards = Array.from({ length: DUE_SOFT_CAP + 2 }, (_, i) => ({
        due: new Date(base - i * 86_400_000).toISOString(),
        instructiveness: 10, // all same instructiveness
        kind: i === DUE_SOFT_CAP ? 'opening' : 'tactical',
      }));
      const sorted = sortDueCards(cards, now);
      expect(sorted[0].kind).toBe('opening');
    });
  });
});
