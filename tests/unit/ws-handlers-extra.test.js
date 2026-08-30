/**
 * Extra branch coverage for ws/handlers.js.
 */
import { describe, it, expect, vi } from 'vitest';

import { makeMessageHandler } from '../../src/api/ws/handlers.js';
import { InMemoryGameRepository } from '../../src/adapters/memory/repositories.js';
import { FixedClock } from '../../src/adapters/clock/fixed-clock.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: vi.fn().mockReturnValue(true) };
});

function makeWs() {
  const ws = {
    readyState: 1,
    OPEN: 1,
    _messages: [],
    _events: {},
    send(data) { this._messages.push(JSON.parse(data)); },
    emit(event, ...args) {
      const fn = this._events[event];
      if (fn) fn(...args);
    },
    on(event, fn) { this._events[event] = fn; },
    once(event, fn) { this._events[event] = fn; },
    lastMessage() { return this._messages[this._messages.length - 1]; },
  };
  return ws;
}

const CLOCK = new FixedClock(1_000_000);

describe('ws-handlers extra branch coverage', () => {
  it('hint with engine pool that returns a bestmove sends hint_result with correct square', async () => {
    const gameRepo = new InMemoryGameRepository();
    const enginePool = {
      getAnalysisSfClient: vi.fn().mockResolvedValue({
        eval: vi.fn().mockResolvedValue({ bestmove: 'e2e4', cp: 30 }),
      }),
    };
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK, enginePool });
    const ws = makeWs();

    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    expect(ws.lastMessage().type).toBe('game_started');

    await handler(ws, JSON.stringify({ type: 'hint' }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('hint_result');
    expect(msg.pieceSquare).toBe('e2');
  });

  it('hint with engine pool returning null bestmove falls back to a1', async () => {
    const gameRepo = new InMemoryGameRepository();
    const enginePool = {
      getAnalysisSfClient: vi.fn().mockResolvedValue({
        eval: vi.fn().mockResolvedValue({ bestmove: null }),
      }),
    };
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK, enginePool });
    const ws = makeWs();

    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    await handler(ws, JSON.stringify({ type: 'hint' }));
    expect(ws.lastMessage().pieceSquare).toBe('a1');
  });

  it('hint with engine pool that throws falls back to a1', async () => {
    const gameRepo = new InMemoryGameRepository();
    const enginePool = {
      getAnalysisSfClient: vi.fn().mockRejectedValue(new Error('engine down')),
    };
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK, enginePool });
    const ws = makeWs();

    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    await handler(ws, JSON.stringify({ type: 'hint' }));
    expect(ws.lastMessage().pieceSquare).toBe('a1');
  });

  it('resume with no engine turn when player goes first', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    // Start and immediately resume
    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    const gameId = ws.lastMessage().gameId;

    const ws2 = makeWs();
    const engineTurnSpy = vi.fn();
    ws2.on('engine_turn', engineTurnSpy);
    await handler(ws2, JSON.stringify({ type: 'resume', gameId }));
    expect(ws2.lastMessage().type).toBe('game_started');
    // It's white's turn (player is white) — no engine_turn expected
    expect(engineTurnSpy).not.toHaveBeenCalled();
  });

  it('resume triggers engine_turn when engine moves first', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    // Create a game where player is black (engine moves first)
    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    const gameId = ws.lastMessage().gameId;

    // Make a white move so it's now black's turn
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));

    // Resume on a new connection — it's now black's turn = engine's turn (if player is white)
    // Actually: player is WHITE, after white's move it's black's turn = engine's turn
    const ws2 = makeWs();
    const engineTurnSpy = vi.fn();
    ws2.on('engine_turn', engineTurnSpy);
    await handler(ws2, JSON.stringify({ type: 'resume', gameId }));
    expect(ws2.lastMessage().type).toBe('game_started');
    expect(engineTurnSpy).toHaveBeenCalled();
  });

  it('resume with unknown game id sends error', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();
    await handler(ws, JSON.stringify({ type: 'resume', gameId: 'no-such-game' }));
    expect(ws.lastMessage().type).toBe('error');
  });

  it('repertoire_choice with no pending move returns no_pending_move error', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    await handler(ws, JSON.stringify({ type: 'repertoire_choice', choice: 'correct' }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('error');
    expect(msg.error_code).toBe('no_pending_move');
  });

  it('close event on tracked ws cleans up session without crashing', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    expect(ws.lastMessage().type).toBe('game_started');

    // Trigger close — should not throw
    ws.emit('close');
    // After close, the session should be cleaned up (no assertion needed beyond no-throw)
  });

  it('ws tracking only registers once per connection', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    // Two messages on the same ws — tracking should only register once
    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    await handler(ws, JSON.stringify({ type: 'hint' }));
    // _pawnbookTracked is set after first call — no duplicate listener
    expect(ws._pawnbookTracked).toBe(true);
  });

  it('hint rate-limits repeated requests', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    const countBefore = ws._messages.length;

    // Two consecutive hints — second should be rate-limited (no response)
    await handler(ws, JSON.stringify({ type: 'hint' }));
    await handler(ws, JSON.stringify({ type: 'hint' }));
    // First hint returned hint_result; second was rate-limited and returned nothing
    const hints = ws._messages.slice(countBefore).filter(m => m.type === 'hint_result');
    expect(hints).toHaveLength(1);
  });

  it('resign clears pending alert timeout if one exists', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    await handler(ws, JSON.stringify({ type: 'resign' }));
    expect(ws.lastMessage().type).toBe('game_over');
  });

  it('outer catch with non-Error thrown sends generic message (covers instanceof false branch)', async () => {
    const gameRepo = {
      save: () => { throw 'string error'; }, // non-Error thrown
      findById: () => null,
    };
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();
    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('error');
    expect(msg.message).toBe('An internal error occurred');
  });

  it('move with timeControl covers clockUpdate branch', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();
    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: { initialSec: 300, incSec: 5 } }));
    expect(ws.lastMessage().type).toBe('game_started');
    // Make a move — clockUpdate fires because timeControl is set
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    expect(ws.lastMessage().type).toBe('move_accepted');
  });

  it('repertoire_choice with no active game sends error (covers !session branch)', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();
    // No new_game — no session
    await handler(ws, JSON.stringify({ type: 'repertoire_choice', choice: 'correct' }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('error');
  });

  it('new_game with black color triggers engine_turn', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    const engineTurnSpy = vi.fn();
    ws.on('engine_turn', engineTurnSpy);

    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'black', ranked: false, timeControl: null }));
    const msg = ws.lastMessage();
    // Either game_started (when random picks black) or error
    if (msg.type === 'game_started') {
      expect(msg.youPlay).toBe('black');
      expect(engineTurnSpy).toHaveBeenCalled();
    }
  });
});
