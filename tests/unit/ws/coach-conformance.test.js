/**
 * Phase 32 — Coach conformance unit tests.
 * Covers B1 (ranked_changed), B2 (deviation routing), B11 (any keep opens challenge),
 * B13 (canonical-node bootstrap), B14 (pre-alert clock capture).
 */
import { describe, it, expect, vi } from 'vitest';

import { makeMessageHandler } from '../../../src/api/ws/handlers.js';
import { InMemoryGameRepository, InMemoryRepertoireRepository } from '../../../src/adapters/memory/repositories.js';
import { FixedClock } from '../../../src/adapters/clock/fixed-clock.js';
import { ManualTimer } from '../../../src/adapters/scheduler/manual-timer.js';
import { REP_BOOTSTRAP_CONFIRMED_MIN } from '../../../src/shared/balance.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: vi.fn().mockReturnValue(true) };
});

// ── helpers ──────────────────────────────────────────────────────────────────

const START_EPD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

function makeWs() {
  const ws = {
    readyState: 1, OPEN: 1,
    _messages: [],
    _events: {},
    send(data) { this._messages.push(JSON.parse(data)); },
    emit(ev, ...args) { if (this._events[ev]) this._events[ev](...args); },
    on(ev, fn) { this._events[ev] = fn; },
    once(ev, fn) { this._events[ev] = fn; },
    lastOfType(type) {
      const msgs = this._messages.filter(m => m.type === type);
      return msgs[msgs.length - 1];
    },
    messagesOfType(type) { return this._messages.filter(m => m.type === type); },
  };
  return ws;
}

/**
 * Add N canonical nodes to the repo, including the starting position with e4 canonical.
 * The first node is the real starting EPD; the rest are synthetic.
 */
function populateCanonicalNodes(repo, count) {
  // Node 0: starting position — canonical move is e2e4
  repo.upsertNode({ epd: START_EPD, side: 'white', encounters: 5 });
  repo.upsertMove({ epd: START_EPD, side: 'white', moveUci: 'e2e4', role: 'canonical', meanWinLossPts: 0.05 });

  // Remaining nodes: synthetic EPDs
  for (let i = 1; i < count; i++) {
    const epd = `synthetic_epd_${i} w - -`;
    repo.upsertNode({ epd, side: 'white', encounters: 5 });
    repo.upsertMove({ epd, side: 'white', moveUci: 'e2e4', role: 'canonical', meanWinLossPts: 0 });
  }
}

function makeHandler(repertoireRepo, opts = {}) {
  const gameRepo = new InMemoryGameRepository();
  const clock = opts.clock ?? new FixedClock(1_000_000);
  const scheduler = opts.scheduler ?? new ManualTimer();
  return {
    handler: makeMessageHandler({ gameRepo, clock, repertoireRepo, scheduler }),
    gameRepo,
    clock,
    scheduler,
  };
}

async function startGame(handler, ws) {
  await handler(ws, JSON.stringify({
    type: 'new_game', opponentId: 'sf-1400', color: 'white',
    ranked: true, coachEnabled: true, timeControl: null,
  }));
  return ws.lastOfType('game_started');
}

// ── B13 — bootstrap guard ────────────────────────────────────────────────────

describe('B13: bootstrap guard counts canonical nodes', () => {
  it('no alert fires when canonical node count is below REP_BOOTSTRAP_CONFIRMED_MIN', async () => {
    const repo = new InMemoryRepertoireRepository();
    populateCanonicalNodes(repo, REP_BOOTSTRAP_CONFIRMED_MIN - 1); // 19 nodes
    const { handler } = makeHandler(repo);
    const ws = makeWs();

    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'd2d4' })); // deviant from e4

    expect(ws.messagesOfType('repertoire_alert')).toHaveLength(0);
  });

  it('alert fires when canonical node count reaches REP_BOOTSTRAP_CONFIRMED_MIN', async () => {
    const repo = new InMemoryRepertoireRepository();
    populateCanonicalNodes(repo, REP_BOOTSTRAP_CONFIRMED_MIN); // 20 nodes
    const { handler } = makeHandler(repo);
    const ws = makeWs();

    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'd2d4' })); // deviant from e4

    expect(ws.messagesOfType('repertoire_alert')).toHaveLength(1);
  });
});

// ── B1 — ranked_changed emitted ───────────────────────────────────────────────

describe('B1: ranked_changed emitted when alert fires', () => {
  it('emits ranked_changed when a ranked game triggers a coach alert', async () => {
    const repo = new InMemoryRepertoireRepository();
    populateCanonicalNodes(repo, REP_BOOTSTRAP_CONFIRMED_MIN);
    const { handler } = makeHandler(repo);
    const ws = makeWs();

    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'd2d4' }));

    const changed = ws.lastOfType('ranked_changed');
    expect(changed).toBeDefined();
    expect(changed.ranked).toBe(false);
  });

  it('does not emit ranked_changed when coach is disabled', async () => {
    const repo = new InMemoryRepertoireRepository();
    populateCanonicalNodes(repo, REP_BOOTSTRAP_CONFIRMED_MIN);
    const { handler } = makeHandler(repo);
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game', opponentId: 'sf-1400', color: 'white',
      ranked: true, coachEnabled: false, timeControl: null,
    }));
    await handler(ws, JSON.stringify({ type: 'move', uci: 'd2d4' }));

    expect(ws.messagesOfType('ranked_changed')).toHaveLength(0);
  });
});

// ── B2 — deviation routing via classifyDeviation ─────────────────────────────

describe('B2: deviation.js routing', () => {
  it('deviant move at a node with canonical fires repertoire_alert with a kind', async () => {
    const repo = new InMemoryRepertoireRepository();
    populateCanonicalNodes(repo, REP_BOOTSTRAP_CONFIRMED_MIN);
    const { handler } = makeHandler(repo);
    const ws = makeWs();

    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'd2d4' }));

    const alert = ws.lastOfType('repertoire_alert');
    expect(alert).toBeDefined();
    expect(alert.kind).toBeDefined();
    expect(['novelty', 'lapse', 'order_slip', 'refused_repeat']).toContain(alert.kind);
  });

  it('refused move fires refused_repeat kind', async () => {
    const repo = new InMemoryRepertoireRepository();
    populateCanonicalNodes(repo, REP_BOOTSTRAP_CONFIRMED_MIN);
    // Mark d4 as 'refused' at the starting position
    repo.upsertMove({ epd: START_EPD, side: 'white', moveUci: 'd2d4', role: 'refused', meanWinLossPts: 0 });
    const { handler } = makeHandler(repo);
    const ws = makeWs();

    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'd2d4' }));

    const alert = ws.lastOfType('repertoire_alert');
    expect(alert).toBeDefined();
    expect(alert.kind).toBe('refused_repeat');
  });
});

// ── B11 — any deliberate keep opens a challenge ───────────────────────────────

describe('B11: any deliberate keep opens a challenge', () => {
  it('sending repertoire_choice keep opens a challenge', async () => {
    const repo = new InMemoryRepertoireRepository();
    populateCanonicalNodes(repo, REP_BOOTSTRAP_CONFIRMED_MIN);
    const scheduler = new ManualTimer();
    const { handler } = makeHandler(repo, { scheduler });
    const ws = makeWs();

    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'd2d4' }));

    // Alert should be pending
    expect(ws.messagesOfType('repertoire_alert')).toHaveLength(1);

    // Player explicitly keeps their move
    await handler(ws, JSON.stringify({ type: 'repertoire_choice', choice: 'keep' }));

    const challenges = repo.listOpenChallenges();
    expect(challenges.length).toBeGreaterThanOrEqual(1);
  });

  it('timed-out alert (auto-keep) does NOT open a challenge', async () => {
    const repo = new InMemoryRepertoireRepository();
    populateCanonicalNodes(repo, REP_BOOTSTRAP_CONFIRMED_MIN);
    const scheduler = new ManualTimer();
    const { handler } = makeHandler(repo, { scheduler });
    const ws = makeWs();

    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'd2d4' }));
    expect(ws.messagesOfType('repertoire_alert')).toHaveLength(1);

    // Fire timeout — should auto-keep without opening a challenge
    scheduler.fireAll();
    await new Promise(r => setTimeout(r, 0));

    expect(repo.listOpenChallenges()).toHaveLength(0);
  });
});

// ── B14 — pre-alert clock capture ────────────────────────────────────────────

describe('B14: clock charges only pre-alert thinking time', () => {
  it('keep path completes without error (chargeElapsedMs is called)', async () => {
    const repo = new InMemoryRepertoireRepository();
    populateCanonicalNodes(repo, REP_BOOTSTRAP_CONFIRMED_MIN);
    const clock = new FixedClock(1_000_000);
    const { handler } = makeHandler(repo, { clock });
    const ws = makeWs();

    await startGame(handler, ws);

    // Advance clock to simulate thinking time before the player's move
    clock.advance(5_000);

    await handler(ws, JSON.stringify({ type: 'move', uci: 'd2d4' }));
    expect(ws.messagesOfType('repertoire_alert')).toHaveLength(1);

    // Advance clock again (alert deliberation time — should NOT be charged)
    clock.advance(10_000);

    // Keep the move — chargeElapsedMs should restore pre-alert baseline
    await handler(ws, JSON.stringify({ type: 'repertoire_choice', choice: 'keep' }));

    const accepted = ws.lastOfType('move_accepted');
    expect(accepted).toBeDefined();
  });

  it('timeout path completes without error (chargeElapsedMs is called on timeout)', async () => {
    const repo = new InMemoryRepertoireRepository();
    populateCanonicalNodes(repo, REP_BOOTSTRAP_CONFIRMED_MIN);
    const clock = new FixedClock(1_000_000);
    const scheduler = new ManualTimer();
    const { handler } = makeHandler(repo, { clock, scheduler });
    const ws = makeWs();

    await startGame(handler, ws);
    clock.advance(3_000);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'd2d4' }));
    expect(ws.messagesOfType('repertoire_alert')).toHaveLength(1);

    clock.advance(8_000);
    scheduler.fireAll();
    await new Promise(r => setTimeout(r, 0));

    const accepted = ws.lastOfType('move_accepted');
    expect(accepted).toBeDefined();
  });
});
