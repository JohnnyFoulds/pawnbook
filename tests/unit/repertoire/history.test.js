/**
 * @module tests/unit/repertoire/history
 * Unit tests for src/domain/repertoire/history.js.
 * All three functions are pure — no repo or DB required.
 */

import { describe, it, expect } from 'vitest';

import { buildTimeline, buildGrowthSeries, buildMilestones } from '../../../src/domain/repertoire/history.js';

// ── helpers ──────────────────────────────────────────────────────────────────

const D1 = new Date('2025-01-06').getTime();
const D2 = new Date('2025-01-07').getTime();
const D3 = new Date('2025-01-08').getTime();

function entry(overrides) {
  return { id: 'x', at: D1, epd: 'start', side: 'white', kind: 'confirm',
    fromUci: null, toUci: 'e2e4', rule: null, detailJson: null, ...overrides };
}

// ── buildTimeline ─────────────────────────────────────────────────────────

describe('buildTimeline', () => {
  it('returns empty array for empty input', () => {
    expect(buildTimeline([])).toEqual([]);
  });

  it('groups entries by date, reverse-chronological', () => {
    const entries = [
      entry({ id: 'a', at: D1, kind: 'confirm' }),
      entry({ id: 'b', at: D2, kind: 'promote' }),
      entry({ id: 'c', at: D3, kind: 'retire' }),
    ];
    const result = buildTimeline(entries);
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2025-01-08');
    expect(result[1].date).toBe('2025-01-07');
    expect(result[2].date).toBe('2025-01-06');
  });

  it('groups multiple entries on the same day together', () => {
    const entries = [
      entry({ id: 'a', at: D1, kind: 'confirm' }),
      entry({ id: 'b', at: D1 + 1000, kind: 'promote' }),
    ];
    const result = buildTimeline(entries);
    expect(result).toHaveLength(1);
    expect(result[0].entries).toHaveLength(2);
  });

  it('sorts entries within a day reverse-chronologically', () => {
    const entries = [
      entry({ id: 'a', at: D1 + 1000, kind: 'confirm' }),
      entry({ id: 'b', at: D1, kind: 'promote' }),
    ];
    const [day] = buildTimeline(entries);
    expect(day.entries[0].id).toBe('a');
    expect(day.entries[1].id).toBe('b');
  });

  it('handles null at gracefully', () => {
    const entries = [entry({ id: 'a', at: null })];
    const result = buildTimeline(entries);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('1970-01-01');
  });

  it('sorts entries with null at within a day (covers ?? 0 branch in sort)', () => {
    const entries = [
      entry({ id: 'a', at: null }),
      entry({ id: 'b', at: null }),
    ];
    const result = buildTimeline(entries);
    expect(result).toHaveLength(1);
    expect(result[0].entries).toHaveLength(2);
  });
});

// ── buildGrowthSeries ─────────────────────────────────────────────────────

describe('buildGrowthSeries', () => {
  it('returns empty array for empty input', () => {
    expect(buildGrowthSeries([])).toEqual([]);
  });

  it('accumulates confirms correctly', () => {
    const entries = [
      entry({ id: 'a', at: D1, kind: 'confirm' }),
      entry({ id: 'b', at: D1 + 100, kind: 'confirm' }),
    ];
    const series = buildGrowthSeries(entries);
    expect(series).toHaveLength(1);
    expect(series[0].confirms).toBe(2);
    expect(series[0].total).toBe(2);
  });

  it('counts elect as confirm', () => {
    const entries = [entry({ id: 'a', at: D1, kind: 'elect' })];
    const series = buildGrowthSeries(entries);
    expect(series[0].confirms).toBe(1);
  });

  it('accumulates across multiple days', () => {
    const entries = [
      entry({ id: 'a', at: D1, kind: 'confirm' }),
      entry({ id: 'b', at: D2, kind: 'promote' }),
      entry({ id: 'c', at: D3, kind: 'retire' }),
    ];
    const series = buildGrowthSeries(entries);
    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ confirms: 1, promotes: 0, retires: 0, total: 1 });
    expect(series[1]).toMatchObject({ confirms: 1, promotes: 1, retires: 0, total: 2 });
    expect(series[2]).toMatchObject({ confirms: 1, promotes: 1, retires: 1, total: 1 });
  });

  it('counts refuses without affecting total', () => {
    const entries = [
      entry({ id: 'a', at: D1, kind: 'confirm' }),
      entry({ id: 'b', at: D2, kind: 'refuse' }),
    ];
    const series = buildGrowthSeries(entries);
    expect(series[1].refuses).toBe(1);
    expect(series[1].total).toBe(1);
  });

  it('returns chronological order', () => {
    const entries = [
      entry({ id: 'b', at: D2, kind: 'confirm' }),
      entry({ id: 'a', at: D1, kind: 'confirm' }),
    ];
    const series = buildGrowthSeries(entries);
    expect(series[0].date).toBe('2025-01-06');
    expect(series[1].date).toBe('2025-01-07');
  });

  it('ignores unknown kinds (settle, quarantine_exit, etc.) in counts', () => {
    const entries = [
      entry({ id: 'a', at: D1, kind: 'confirm' }),
      entry({ id: 'b', at: D1 + 1, kind: 'settle' }),
      entry({ id: 'c', at: D1 + 2, kind: 'quarantine_exit' }),
    ];
    const series = buildGrowthSeries(entries);
    expect(series).toHaveLength(1);
    expect(series[0].confirms).toBe(1);
    expect(series[0].total).toBe(1);
  });

  it('handles null at entries (covers ?? 0 branch in sort)', () => {
    const entries = [
      entry({ id: 'a', at: null }),
      entry({ id: 'b', at: null }),
    ];
    const series = buildGrowthSeries(entries);
    expect(series).toHaveLength(1);
    expect(series[0].confirms).toBe(2);
  });
});

// ── buildMilestones ───────────────────────────────────────────────────────

describe('buildMilestones', () => {
  it('returns all-null for empty input', () => {
    const m = buildMilestones([]);
    expect(m.firstConfirm).toBeNull();
    expect(m.coachWoke).toBeNull();
    expect(m.firstPromotion).toBeNull();
    expect(m.firstRefusal).toBeNull();
    expect(m.firstReversal).toBeNull();
  });

  it('finds firstConfirm', () => {
    const entries = [entry({ id: 'a', at: D1, kind: 'confirm' })];
    const m = buildMilestones(entries);
    expect(m.firstConfirm).toEqual({ at: D1, kind: 'confirm' });
  });

  it('treats elect as a confirm for firstConfirm and coachWoke', () => {
    const entries = [entry({ id: 'a', at: D1, kind: 'elect' })];
    const m = buildMilestones(entries);
    expect(m.firstConfirm).toEqual({ at: D1, kind: 'elect' });
  });

  it('sets coachWoke at the 20th confirm', () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      entry({ id: `e${i}`, at: D1 + i * 1000, kind: 'confirm' })
    );
    const m = buildMilestones(entries);
    expect(m.coachWoke).not.toBeNull();
    expect(m.coachWoke.at).toBe(D1 + 19 * 1000);
  });

  it('coachWoke is null when fewer than 20 confirms', () => {
    const entries = Array.from({ length: 19 }, (_, i) =>
      entry({ id: `e${i}`, at: D1 + i * 1000, kind: 'confirm' })
    );
    const m = buildMilestones(entries);
    expect(m.coachWoke).toBeNull();
  });

  it('finds firstPromotion, firstRefusal, firstReversal', () => {
    const entries = [
      entry({ id: 'a', at: D1, kind: 'promote' }),
      entry({ id: 'b', at: D2, kind: 'refuse' }),
      entry({ id: 'c', at: D3, kind: 'reverse' }),
    ];
    const m = buildMilestones(entries);
    expect(m.firstPromotion).toEqual({ at: D1, kind: 'promote' });
    expect(m.firstRefusal).toEqual({ at: D2, kind: 'refuse' });
    expect(m.firstReversal).toEqual({ at: D3, kind: 'reverse' });
  });

  it('returns the earliest entry for each milestone', () => {
    const entries = [
      entry({ id: 'b', at: D2, kind: 'refuse' }),
      entry({ id: 'a', at: D1, kind: 'refuse' }),
    ];
    const m = buildMilestones(entries);
    expect(m.firstRefusal.at).toBe(D1);
  });

  it('early-exit once all five milestones are found', () => {
    // Build 25 confirms + one each of promote, refuse, reverse so all 5 fire.
    const entries = [
      ...Array.from({ length: 25 }, (_, i) =>
        entry({ id: `c${i}`, at: D1 + i * 100, kind: 'confirm' })
      ),
      entry({ id: 'p1', at: D1 + 3000, kind: 'promote' }),
      entry({ id: 'r1', at: D1 + 4000, kind: 'refuse' }),
      entry({ id: 'rv', at: D1 + 5000, kind: 'reverse' }),
    ];
    const m = buildMilestones(entries);
    expect(m.firstConfirm).not.toBeNull();
    expect(m.coachWoke).not.toBeNull();
    expect(m.firstPromotion).not.toBeNull();
    expect(m.firstRefusal).not.toBeNull();
    expect(m.firstReversal).not.toBeNull();
  });
});
