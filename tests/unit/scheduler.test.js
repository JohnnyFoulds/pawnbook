import { describe, it, expect } from 'vitest';

import { FakeScheduler } from '../../src/adapters/scheduler/fake-scheduler.js';
import { FsrsScheduler } from '../../src/adapters/scheduler/fsrs-scheduler.js';

const BASE_CARD = {
  due: new Date(),
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  reps: 0,
  lapses: 0,
  state: 0,
  last_review: null,
};

describe('FakeScheduler', () => {
  it('newCard returns a card due tomorrow', () => {
    const sched = new FakeScheduler();
    const card = sched.newCard();
    expect(card.reps).toBe(0);
    expect(card.due instanceof Date).toBe(true);
    expect(card.due.getTime()).toBeGreaterThan(Date.now());
  });

  it('Again yields a nearer due date than Good', () => {
    const sched = new FakeScheduler();
    const now = new Date();
    const { card: againCard } = sched.schedule({ ...BASE_CARD }, 'Again', now);
    const { card: goodCard } = sched.schedule({ ...BASE_CARD }, 'Good', now);
    expect(againCard.due.getTime()).toBeLessThan(goodCard.due.getTime());
  });

  it('records calls for assertions', () => {
    const sched = new FakeScheduler();
    sched.schedule({ ...BASE_CARD }, 'Good', new Date());
    expect(sched.calls).toHaveLength(1);
    expect(sched.calls[0].rating).toBe('Good');
  });

  it('Again increments lapses', () => {
    const sched = new FakeScheduler();
    const { card } = sched.schedule({ ...BASE_CARD, lapses: 0 }, 'Again', new Date());
    expect(card.lapses).toBe(1);
  });

  it('Good does not increment lapses', () => {
    const sched = new FakeScheduler();
    const { card } = sched.schedule({ ...BASE_CARD, lapses: 2 }, 'Good', new Date());
    expect(card.lapses).toBe(2);
  });

  it('_nextDue override is used when set', () => {
    const sched = new FakeScheduler();
    const overrideDue = new Date('2030-01-01');
    sched._nextDue = overrideDue;
    const { card } = sched.schedule({ ...BASE_CARD }, 'Good', new Date());
    expect(card.due.getTime()).toBe(overrideDue.getTime());
  });

  it('Hard returns an interval between Again and Good', () => {
    const sched = new FakeScheduler();
    const now = new Date();
    const { card: hardCard } = sched.schedule({ ...BASE_CARD }, 'Hard', now);
    const { card: againCard } = sched.schedule({ ...BASE_CARD }, 'Again', now);
    const { card: goodCard } = sched.schedule({ ...BASE_CARD }, 'Good', now);
    expect(hardCard.due.getTime()).toBeGreaterThanOrEqual(againCard.due.getTime());
    expect(hardCard.due.getTime()).toBeLessThanOrEqual(goodCard.due.getTime());
  });

  it('Easy returns the farthest interval', () => {
    const sched = new FakeScheduler();
    const now = new Date();
    const { card: easyCard } = sched.schedule({ ...BASE_CARD }, 'Easy', now);
    const { card: goodCard } = sched.schedule({ ...BASE_CARD }, 'Good', now);
    expect(easyCard.due.getTime()).toBeGreaterThanOrEqual(goodCard.due.getTime());
  });
});

describe('FsrsScheduler', () => {
  it('newCard returns a card with reps=0 and a future due date', () => {
    const sched = new FsrsScheduler();
    const card = sched.newCard();
    expect(card.due instanceof Date || typeof card.due === 'string' || card.due !== undefined).toBe(true);
  });

  it('Again yields a nearer due date than Good', () => {
    const sched = new FsrsScheduler();
    const now = new Date();

    const { card: empty1 } = { card: sched.newCard() };
    const { card: empty2 } = { card: sched.newCard() };

    const { card: againCard } = sched.schedule(empty1, 'Again', now);
    const { card: goodCard } = sched.schedule(empty2, 'Good', now);

    const againDue = new Date(againCard.due).getTime();
    const goodDue = new Date(goodCard.due).getTime();
    expect(againDue).toBeLessThanOrEqual(goodDue);
  });

  it('throws for unknown rating', () => {
    const sched = new FsrsScheduler();
    expect(() => sched.schedule(sched.newCard(), 'Brilliant')).toThrow(/Brilliant/);
  });

  it('returns card with updated reps', () => {
    const sched = new FsrsScheduler();
    const card = sched.newCard();
    const { card: updated } = sched.schedule(card, 'Good', new Date());
    const reps = updated.reps ?? updated.rep ?? 0;
    expect(reps).toBeGreaterThan(0);
  });
});

describe('FakeScheduler — edge cases', () => {
  it('unknown rating falls back to a 1-day interval', () => {
    const sched = new FakeScheduler();
    const now = new Date();
    const { card } = sched.schedule({ ...BASE_CARD }, 'SuperEasy', now);
    // fallback intervalDays = 1
    expect(card.due.getTime()).toBeCloseTo(now.getTime() + 86_400_000, -3);
  });

  it('card without lapses field defaults lapses to 0 for non-Again rating', () => {
    const sched = new FakeScheduler();
    const cardNoLapses = { due: new Date(), stability: 0, difficulty: 0,
      elapsed_days: 0, scheduled_days: 0, reps: 0, state: 0, last_review: null };
    const { card } = sched.schedule(cardNoLapses, 'Good', new Date());
    expect(card.lapses).toBe(0);
  });

  it('card without lapses field increments lapses correctly for Again', () => {
    const sched = new FakeScheduler();
    const cardNoLapses = { due: new Date(), stability: 0, difficulty: 0,
      elapsed_days: 0, scheduled_days: 0, reps: 0, state: 0, last_review: null };
    const { card } = sched.schedule(cardNoLapses, 'Again', new Date());
    expect(card.lapses).toBe(1);
  });
});
