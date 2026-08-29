/**
 * @module tests/unit/repertoire/coach.test.js
 * Unit tests for the live repertoire coach (Phase 21).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { makeMessageHandler } from '../../../src/api/ws/handlers.js';
import { InMemoryGameRepository, InMemoryRepertoireRepository } from '../../../src/adapters/memory/repositories.js';
import { FixedClock } from '../../../src/adapters/clock/fixed-clock.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: vi.fn().mockReturnValue(true) };
});

const CLOCK = new FixedClock(1_000_000);
// Starting position EPD (first 4 FEN fields)
const START_EPD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

function makeWs() {
  const ws = {
    readyState: 1,
    OPEN: 1,
    _messages: [],
    _events: {},
    _onceEvents: {},
    send(data) { this._messages.push(JSON.parse(data)); },
    emit(event, ...args) {
      if (this._events[event]) this._events[event](...args);
      if (this._onceEvents[event]) {
        const fn = this._onceEvents[event];
        delete this._onceEvents[event];
        fn(...args);
      }
    },
    on(event, fn) { this._events[event] = fn; },
    once(event, fn) { this._onceEvents[event] = fn; },
    lastMessage() { return this._messages[this._messages.length - 1]; },
  };
  return ws;
}

const MOCK_SETTINGS = { get: () => '1200', set: () => {} };

const BASE_MOVE = {
  side: 'white',
  observations: 2,
  weightedScore: null,
  meanWinLossPts: 5,
  worstWinLossPts: 8,
  auditId: null,
  gateReason: null,
  scoreW: 1, scoreD: 0, scoreL: 0,
  firstPlayed: 0, lastPlayed: 0,
};

/** Build a bootstrapped repo (20 confirmed-proxy nodes + optional extra moves). */
function makeRepo(extraMoves = []) {
  const repo = new InMemoryRepertoireRepository();
  repo.getOrCreateProvenance({
    schemaVersion: '21', balanceHash: null, appGitSha: null,
    sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null,
  });
  for (let i = 0; i < 20; i++) {
    repo.upsertNode({
      epd: `fake-epd-${i}`, side: 'white', fen: `fake-fen-${i}`,
      encounters: 2, timesReached: 2, minPly: 1,
      firstSeen: 0, lastSeen: 0, reachProb: null, reachStale: false,
      lineLoss: 0, voteFrozenUntilEncounter: null,
    });
  }
  for (const m of extraMoves) repo.upsertMove(m);
  return repo;
}

async function startGame(handler, ws) {
  await handler(ws, JSON.stringify({
    type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: true,
  }));
  return ws._messages.find(m => m.type === 'game_started');
}

describe('repertoire coach (Phase 21)', () => {
  let gameRepo, ws;

  beforeEach(() => {
    gameRepo = new InMemoryGameRepository();
    ws = makeWs();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coach is silent before bootstrap (< 20 confirmed nodes)', async () => {
    const repo = new InMemoryRepertoireRepository();
    // Only 5 nodes — below REP_BOOTSTRAP_CONFIRMED_MIN=20
    for (let i = 0; i < 5; i++) {
      repo.upsertNode({
        epd: `fake-epd-${i}`, side: 'white', fen: `fake-fen-${i}`,
        encounters: 2, timesReached: 2, minPly: 1,
        firstSeen: 0, lastSeen: 0, reachProb: null, reachStale: false,
        lineLoss: 0, voteFrozenUntilEncounter: null,
      });
    }
    repo.upsertMove({ ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e4', moveSan: 'e4', role: 'refused' });
    const handler = makeMessageHandler({ gameRepo, settingsRepo: MOCK_SETTINGS, clock: CLOCK, repertoireRepo: repo });
    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    expect(ws.lastMessage().type).toBe('move_accepted');
    expect(ws._messages.some(m => m.type === 'repertoire_alert')).toBe(false);
  });

  it('coach is silent when player plays a canonical move (in ACCEPTED_SET)', async () => {
    const repo = makeRepo([
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e4', moveSan: 'e4', role: 'canonical' },
    ]);
    const handler = makeMessageHandler({ gameRepo, settingsRepo: MOCK_SETTINGS, clock: CLOCK, repertoireRepo: repo });
    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    expect(ws.lastMessage().type).toBe('move_accepted');
    expect(ws._messages.some(m => m.type === 'repertoire_alert')).toBe(false);
  });

  it('fires alert (refused_repeat) when player plays a refused move with canonical present', async () => {
    const repo = makeRepo([
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e4', moveSan: 'e4', role: 'refused' },
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e3', moveSan: 'e3', role: 'canonical' },
    ]);
    const handler = makeMessageHandler({ gameRepo, settingsRepo: MOCK_SETTINGS, clock: CLOCK, repertoireRepo: repo });
    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    const alert = ws._messages.find(m => m.type === 'repertoire_alert');
    expect(alert).toBeDefined();
    expect(alert.kind).toBe('refused_repeat');
    expect(alert.playerUci).toBe('e2e4');
    expect(alert.bookUci).toBe('e2e3');
    expect(alert.bookSan).toBe('e3');
  });

  it('fires alert (lapse) when player plays a retired move with canonical present', async () => {
    const repo = makeRepo([
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e4', moveSan: 'e4', role: 'retired' },
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e3', moveSan: 'e3', role: 'canonical' },
    ]);
    const handler = makeMessageHandler({ gameRepo, settingsRepo: MOCK_SETTINGS, clock: CLOCK, repertoireRepo: repo });
    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    const alert = ws._messages.find(m => m.type === 'repertoire_alert');
    expect(alert).toBeDefined();
    expect(alert.kind).toBe('lapse');
  });

  it('repertoire_choice without a pending move returns NO_PENDING_MOVE error', async () => {
    const repo = makeRepo([]);
    const handler = makeMessageHandler({ gameRepo, settingsRepo: MOCK_SETTINGS, clock: CLOCK, repertoireRepo: repo });
    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'repertoire_choice', choice: 'keep' }));
    const err = ws.lastMessage();
    expect(err.type).toBe('error');
    expect(err.error_code).toBe('no_pending_move');
  });

  it('choice "correct" applies the book move and records alerted_corrected deviation', async () => {
    const repo = makeRepo([
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e4', moveSan: 'e4', role: 'refused' },
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e3', moveSan: 'e3', role: 'canonical' },
    ]);
    const handler = makeMessageHandler({ gameRepo, settingsRepo: MOCK_SETTINGS, clock: CLOCK, repertoireRepo: repo });
    const started = await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    expect(ws._messages.some(m => m.type === 'repertoire_alert')).toBe(true);

    await handler(ws, JSON.stringify({ type: 'repertoire_choice', choice: 'correct' }));
    const accepted = ws.lastMessage();
    expect(accepted.type).toBe('move_accepted');
    expect(accepted.san).toBe('e3'); // book move e2e3

    const devs = repo.getDeviationsForGame(started.gameId);
    expect(devs).toHaveLength(1);
    expect(devs[0].resolution).toBe('alerted_corrected');
    expect(devs[0].playedUci).toBe('e2e3');
    expect(devs[0].bookUci).toBe('e2e3');
  });

  it('choice "keep" applies the player move and records alerted_kept deviation', async () => {
    const repo = makeRepo([
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e4', moveSan: 'e4', role: 'refused' },
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e3', moveSan: 'e3', role: 'canonical' },
    ]);
    const handler = makeMessageHandler({ gameRepo, settingsRepo: MOCK_SETTINGS, clock: CLOCK, repertoireRepo: repo });
    const started = await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    await handler(ws, JSON.stringify({ type: 'repertoire_choice', choice: 'keep' }));
    const accepted = ws.lastMessage();
    expect(accepted.type).toBe('move_accepted');
    expect(accepted.san).toBe('e4'); // player's move

    const devs = repo.getDeviationsForGame(started.gameId);
    expect(devs).toHaveLength(1);
    expect(devs[0].resolution).toBe('alerted_kept');
    expect(devs[0].playedUci).toBe('e2e4');
  });

  it('choice "keep" on refused_repeat opens a challenge', async () => {
    const repo = makeRepo([
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e4', moveSan: 'e4', role: 'refused' },
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e3', moveSan: 'e3', role: 'canonical' },
    ]);
    const handler = makeMessageHandler({ gameRepo, settingsRepo: MOCK_SETTINGS, clock: CLOCK, repertoireRepo: repo });
    await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    await handler(ws, JSON.stringify({ type: 'repertoire_choice', choice: 'keep' }));

    const challenge = repo.getOpenChallenge(START_EPD, 'white');
    expect(challenge).toBeDefined();
    expect(challenge.incumbentUci).toBe('e2e3');
    expect(challenge.challengerUci).toBe('e2e4');
    expect(challenge.status).toBe('open');
  });

  it('timeout auto-applies player move with alerted_timeout and opens no challenge', async () => {
    vi.useFakeTimers();
    const repo = makeRepo([
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e4', moveSan: 'e4', role: 'refused' },
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e3', moveSan: 'e3', role: 'canonical' },
    ]);
    const handler = makeMessageHandler({ gameRepo, settingsRepo: MOCK_SETTINGS, clock: CLOCK, repertoireRepo: repo });
    const started = await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    expect(ws._messages.some(m => m.type === 'repertoire_alert')).toBe(true);

    // Fire the 60-second timeout
    vi.advanceTimersByTime(60_001);

    const accepted = ws.lastMessage();
    expect(accepted.type).toBe('move_accepted');
    expect(accepted.san).toBe('e4'); // player's original move applied

    const devs = repo.getDeviationsForGame(started.gameId);
    expect(devs).toHaveLength(1);
    expect(devs[0].resolution).toBe('alerted_timeout');

    // Invariant 15: no challenge opened on timeout
    const challenge = repo.getOpenChallenge(START_EPD, 'white');
    expect(challenge).toBeNull();
  });

  it('game becomes unranked when coach alert fires', async () => {
    const repo = makeRepo([
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e4', moveSan: 'e4', role: 'refused' },
      { ...BASE_MOVE, epd: START_EPD, moveUci: 'e2e3', moveSan: 'e3', role: 'canonical' },
    ]);
    const handler = makeMessageHandler({ gameRepo, settingsRepo: MOCK_SETTINGS, clock: CLOCK, repertoireRepo: repo });
    const started = await startGame(handler, ws);
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    // Choose 'correct' so the move is applied and we can resign
    await handler(ws, JSON.stringify({ type: 'repertoire_choice', choice: 'correct' }));
    await handler(ws, JSON.stringify({ type: 'resign' }));

    const savedGame = gameRepo.findById(started.gameId);
    expect(savedGame.ranked).toBe(false);
  });
});
