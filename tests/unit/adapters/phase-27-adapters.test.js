/**
 * Coverage tests for Phase 27 infrastructure adapters:
 * ManualTimer, SequentialIds, UuidIds, FakeEnginePool.
 */
import { describe, it, expect } from 'vitest';

import { ManualTimer } from '../../../src/adapters/scheduler/manual-timer.js';
import { SequentialIds } from '../../../src/adapters/ids/sequential-ids.js';
import { UuidIds } from '../../../src/adapters/ids/uuid-ids.js';
import { createFakeEnginePool } from '../../../src/adapters/engine/fake-engine-pool.js';

// ─── ManualTimer ─────────────────────────────────────────────────────────────

describe('ManualTimer', () => {
  it('schedule returns an incrementing handle', () => {
    const t = new ManualTimer();
    const h1 = t.schedule(() => {}, 1000);
    const h2 = t.schedule(() => {}, 1000);
    expect(h2).toBe(h1 + 1);
    expect(t.pendingCount).toBe(2);
  });

  it('cancel removes the pending entry', () => {
    const t = new ManualTimer();
    const h = t.schedule(() => {}, 1000);
    t.cancel(h);
    expect(t.pendingCount).toBe(0);
  });

  it('cancel on unknown handle is a no-op', () => {
    const t = new ManualTimer();
    expect(() => t.cancel(999)).not.toThrow();
  });

  it('fire invokes the callback and removes it', () => {
    const t = new ManualTimer();
    let called = 0;
    const h = t.schedule(() => { called++; }, 0);
    t.fire(h);
    expect(called).toBe(1);
    expect(t.pendingCount).toBe(0);
  });

  it('fire on cancelled handle is a no-op', () => {
    const t = new ManualTimer();
    const h = t.schedule(() => {}, 0);
    t.cancel(h);
    expect(() => t.fire(h)).not.toThrow(); // handle gone — no fn to call
  });

  it('fireAll invokes all pending callbacks in order', () => {
    const t = new ManualTimer();
    const log = [];
    t.schedule(() => log.push('a'), 100);
    t.schedule(() => log.push('b'), 200);
    t.fireAll();
    expect(log).toEqual(['a', 'b']);
    expect(t.pendingCount).toBe(0);
  });

  it('fireAll on empty timer is safe', () => {
    const t = new ManualTimer();
    expect(() => t.fireAll()).not.toThrow();
  });
});

// ─── SequentialIds ───────────────────────────────────────────────────────────

describe('SequentialIds', () => {
  it('generates sequential IDs with default prefix', () => {
    const ids = new SequentialIds();
    expect(ids.next()).toBe('id-1');
    expect(ids.next()).toBe('id-2');
  });

  it('respects custom prefix and start', () => {
    const ids = new SequentialIds('game', 10);
    expect(ids.next()).toBe('game-10');
    expect(ids.next()).toBe('game-11');
  });

  it('reset restores the counter', () => {
    const ids = new SequentialIds('x', 5);
    ids.next();
    ids.next();
    ids.reset(1);
    expect(ids.next()).toBe('x-1');
  });
});

// ─── UuidIds ─────────────────────────────────────────────────────────────────

describe('UuidIds', () => {
  it('returns a valid UUID v4', () => {
    const ids = new UuidIds();
    const id = ids.next();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns unique values on successive calls', () => {
    const ids = new UuidIds();
    expect(ids.next()).not.toBe(ids.next());
  });
});

// ─── FakeEnginePool ──────────────────────────────────────────────────────────

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Scholar's mate — white is checkmated; has 0 legal moves
const NO_MOVES_FEN = 'rnb1kbnr/pppp1ppp/4p3/8/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

describe('createFakeEnginePool', () => {
  it('requestMove returns first legal move from starting position', async () => {
    const pool = createFakeEnginePool();
    const result = await pool.requestMove({ fen: STARTING_FEN });
    expect(result).toBeTruthy();
    expect(typeof result.uci).toBe('string');
  });

  it('requestMove returns null when no legal moves', async () => {
    const pool = createFakeEnginePool();
    const result = await pool.requestMove({ fen: NO_MOVES_FEN });
    expect(result).toBeNull();
  });

  it('getAnalysisSfClient returns a client with eval', async () => {
    const pool = createFakeEnginePool({ cp: 50 });
    const client = await pool.getAnalysisSfClient();
    const r = await client.eval(STARTING_FEN);
    expect(r.cp).toBe(50);
    expect(typeof r.bestmove).toBe('string');
  });

  it('getMaiaAnalysisClient returns a client with policy', async () => {
    const pool = createFakeEnginePool();
    const client = await pool.getMaiaAnalysisClient('maia-1100');
    const policy = await client.policy(STARTING_FEN);
    expect(policy.size).toBeGreaterThan(0);
    // All probs sum to approximately 1
    const total = [...policy.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('maia policy returns empty map when no legal moves', async () => {
    const pool = createFakeEnginePool();
    const client = await pool.getMaiaAnalysisClient('maia-1100');
    const policy = await client.policy(NO_MOVES_FEN);
    expect(policy.size).toBe(0);
  });

  it('sf eval falls back to e2e4 bestmove on empty board', async () => {
    const pool = createFakeEnginePool();
    const client = await pool.getAnalysisSfClient();
    const r = await client.eval(NO_MOVES_FEN);
    expect(r.bestmove).toBe('e2e4');
  });

  it('dispose is a no-op', () => {
    const pool = createFakeEnginePool();
    expect(() => pool.dispose()).not.toThrow();
  });
});
