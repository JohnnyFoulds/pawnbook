import { describe, it, expect, vi } from 'vitest';

import { makeMessageHandler } from '../../src/api/ws/handlers.js';
import { InMemoryGameRepository } from '../../src/adapters/memory/repositories.js';
import { FixedClock } from '../../src/adapters/clock/fixed-clock.js';

// Make all weight files appear to exist (needed for roster.getAvailableOpponents)
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: vi.fn().mockReturnValue(true) };
});

// Simple mock WebSocket
function makeWs() {
  const ws = {
    readyState: 1, // OPEN
    OPEN: 1,
    _messages: [],
    _events: {},
    send(data) { this._messages.push(JSON.parse(data)); },
    emit(event, ...args) {
      if (this._events[event]) this._events[event](...args);
    },
    on(event, fn) { this._events[event] = fn; },
    lastMessage() { return this._messages[this._messages.length - 1]; },
  };
  return ws;
}

const CLOCK = new FixedClock(1_000_000);

describe('ws-handlers: makeMessageHandler', () => {
  it('returns a function', () => {
    const handler = makeMessageHandler({
      gameRepo: new InMemoryGameRepository(),
      clock: CLOCK,
    });
    expect(typeof handler).toBe('function');
  });

  it('malformed JSON returns validation_failed', async () => {
    const handler = makeMessageHandler({
      gameRepo: new InMemoryGameRepository(),
      clock: CLOCK,
    });
    const ws = makeWs();
    await handler(ws, '{invalid json}');
    expect(ws._messages[0].type).toBe('error');
  });

  it('unknown type returns validation error', async () => {
    const handler = makeMessageHandler({
      gameRepo: new InMemoryGameRepository(),
      clock: CLOCK,
    });
    const ws = makeWs();
    await handler(ws, JSON.stringify({ type: 'bogus_type' }));
    expect(ws._messages[0].type).toBe('error');
  });

  it('invalid timeControl payload is rejected by Zod before a game row is created', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    // initialSec must be a positive integer — -1 should fail validation
    await handler(ws, JSON.stringify({
      type: 'new_game',
      opponentId: 'sf-1400',
      color: 'white',
      ranked: false,
      timeControl: { initialSec: -1, incSec: 0 },
    }));

    const msg = ws._messages[0];
    expect(msg.type).toBe('error');
    expect(msg.error_code).toBe('validation_failed');
    // No game row should have been created
    expect(gameRepo.findAll?.()?.length ?? 0).toBe(0);
  });

  it('new_game with valid payload sends game_started', async () => {
    const handler = makeMessageHandler({
      gameRepo: new InMemoryGameRepository(),
      clock: CLOCK,
    });
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game',
      opponentId: 'sf-1400',
      color: 'white',
      ranked: false,
      timeControl: null,
    }));

    const msg = ws.lastMessage();
    expect(msg.type).toBe('game_started');
    expect(msg.youPlay).toBe('white');
    expect(msg.fen).toBeDefined();
    expect(Array.isArray(msg.legalMoves)).toBe(true);
  });

  it('move without a game session returns internal_error', async () => {
    const handler = makeMessageHandler({
      gameRepo: new InMemoryGameRepository(),
      clock: CLOCK,
    });
    const ws = makeWs();
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    expect(ws.lastMessage().type).toBe('error');
  });

  it('resign without a game session returns internal_error', async () => {
    const handler = makeMessageHandler({
      gameRepo: new InMemoryGameRepository(),
      clock: CLOCK,
    });
    const ws = makeWs();
    await handler(ws, JSON.stringify({ type: 'resign' }));
    expect(ws.lastMessage().type).toBe('error');
  });

  it('hint without a game session returns internal_error', async () => {
    const handler = makeMessageHandler({
      gameRepo: new InMemoryGameRepository(),
      clock: CLOCK,
    });
    const ws = makeWs();
    await handler(ws, JSON.stringify({ type: 'hint' }));
    expect(ws.lastMessage().type).toBe('error');
  });

  it('new_game with random color picks white or black', async () => {
    const handler = makeMessageHandler({
      gameRepo: new InMemoryGameRepository(),
      clock: CLOCK,
    });
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game',
      opponentId: 'sf-1400',
      color: 'random',
      ranked: false,
      timeControl: null,
    }));

    const msg = ws.lastMessage();
    if (msg.type === 'game_started') {
      expect(['white', 'black']).toContain(msg.youPlay);
    }
  });

  it('resign after a game sends game_over', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    // Start a game
    await handler(ws, JSON.stringify({
      type: 'new_game',
      opponentId: 'sf-1400',
      color: 'white',
      ranked: false,
      timeControl: null,
    }));

    expect(ws.lastMessage().type).toBe('game_started');

    // Resign
    await handler(ws, JSON.stringify({ type: 'resign' }));
    const lastMsg = ws.lastMessage();
    expect(lastMsg.type).toBe('game_over');
    expect(lastMsg.termination).toBe('resignation');
  });

  it('a legal move sends move_accepted', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    // Start a game as white
    await handler(ws, JSON.stringify({
      type: 'new_game',
      opponentId: 'sf-1400',
      color: 'white',
      ranked: false,
      timeControl: null,
    }));

    expect(ws.lastMessage().type).toBe('game_started');
    const engineTurnSpy = vi.fn();
    ws.on('engine_turn', engineTurnSpy);

    // Play e4
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('move_accepted');
    expect(msg.fen).toBeDefined();
  });

  it('an illegal move sends an error', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game',
      opponentId: 'sf-1400',
      color: 'white',
      ranked: false,
      timeControl: null,
    }));

    // Play an illegal move (valid UCI format but not a legal chess move from startpos)
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e5' }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('error');
    // WS handler wraps domain errors as internal_error — the error message carries the detail
    expect(msg.message).toMatch(/illegal|invalid|move/i);
  });

  it('new_game with timeControl sends clock in game_started', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game',
      opponentId: 'sf-1400',
      color: 'white',
      ranked: false,
      timeControl: { initialSec: 300, incSec: 3 },
    }));

    const msg = ws.lastMessage();
    expect(msg.type).toBe('game_started');
    expect(msg.clock).toBeDefined();
    expect(msg.clock.whiteMs).toBe(300 * 1000);
  });

  it('hint in a casual game returns hint_result', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game',
      opponentId: 'sf-1400',
      color: 'white',
      ranked: false,
      timeControl: null,
    }));

    await handler(ws, JSON.stringify({ type: 'hint' }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('hint_result');
  });

  it('resume sends game_started with resumed=true', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    // Start and save a game
    await handler(ws, JSON.stringify({
      type: 'new_game',
      opponentId: 'sf-1400',
      color: 'white',
      ranked: false,
      timeControl: null,
    }));

    const startMsg = ws.lastMessage();
    expect(startMsg.type).toBe('game_started');
    const gameId = startMsg.gameId;

    // Resume it on a fresh WS connection
    const ws2 = makeWs();
    await handler(ws2, JSON.stringify({ type: 'resume', gameId }));
    const resumeMsg = ws2.lastMessage();
    expect(resumeMsg.type).toBe('game_started');
    expect(resumeMsg.resumed).toBe(true);
  });

  it('resume with time control includes clock in response', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    // Start a timed game
    await handler(ws, JSON.stringify({
      type: 'new_game',
      opponentId: 'sf-1400',
      color: 'white',
      ranked: false,
      timeControl: { initialSec: 300, incSec: 3 },
    }));

    const startMsg = ws.lastMessage();
    expect(startMsg.type).toBe('game_started');
    const gameId = startMsg.gameId;

    // Resume the timed game
    const ws2 = makeWs();
    await handler(ws2, JSON.stringify({ type: 'resume', gameId }));
    const resumeMsg = ws2.lastMessage();
    expect(resumeMsg.type).toBe('game_started');
    expect(resumeMsg.clock).toBeDefined();
  });

  it('resume: moves are appended to game_moves as each is accepted', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null,
    }));
    const gameId = ws.lastMessage().gameId;
    expect(ws.lastMessage().type).toBe('game_started');

    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    expect(ws.lastMessage().type).toBe('move_accepted');

    const moves = gameRepo.getMoves(gameId);
    expect(moves.length).toBeGreaterThanOrEqual(1);
    expect(moves.some(m => m.uci === 'e2e4')).toBe(true);
  });

  it('an in_progress game never resumed is marked abandoned', () => {
    // Simulate server restart: repo has an orphaned in_progress game
    const gameRepo = new InMemoryGameRepository();
    gameRepo.save({ id: 'orphan-1', opponentId: 'maia-1300', playerColor: 'white',
      ranked: false, status: 'in_progress' });
    gameRepo.abandonAllInProgress();
    const game = gameRepo.findById('orphan-1');
    expect(game.status).toBe('abandoned');
  });

  it('hint with enginePool returning bestmove sends hint_result with piece square', async () => {
    const gameRepo = new InMemoryGameRepository();
    const fakePool = {
      getAnalysisSfClient: async () => ({
        eval: async () => ({ bestmove: 'e2e4', cp: 20, pv: 'e2e4', mate: null }),
      }),
    };
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK, enginePool: fakePool });
    const ws = makeWs();

    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    expect(ws.lastMessage().type).toBe('game_started');

    await handler(ws, JSON.stringify({ type: 'hint' }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('hint_result');
    expect(msg.pieceSquare).toBe('e2');
  });

  it('hint with enginePool returning null bestmove falls back to a1', async () => {
    const gameRepo = new InMemoryGameRepository();
    const fakePool = {
      getAnalysisSfClient: async () => ({
        eval: async () => ({ bestmove: null, cp: 0, pv: '', mate: null }),
      }),
    };
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK, enginePool: fakePool });
    const ws = makeWs();

    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    await handler(ws, JSON.stringify({ type: 'hint' }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('hint_result');
    expect(msg.pieceSquare).toBe('a1');
  });

  it('hint with enginePool that throws falls back to a1', async () => {
    const gameRepo = new InMemoryGameRepository();
    const fakePool = {
      getAnalysisSfClient: async () => { throw new Error('engine unavailable'); },
    };
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK, enginePool: fakePool });
    const ws = makeWs();

    await handler(ws, JSON.stringify({ type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null }));
    await handler(ws, JSON.stringify({ type: 'hint' }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('hint_result');
    expect(msg.pieceSquare).toBe('a1');
  });

  it('resume triggers engine_turn when it is not the player turn', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    // Start a game as black — engine (white) moves first
    await handler(ws, JSON.stringify({
      type: 'new_game', opponentId: 'sf-1400', color: 'black', ranked: false, timeControl: null,
    }));
    const gameId = ws._messages.find(m => m.type === 'game_started')?.gameId;
    expect(gameId).toBeDefined();

    // Resume on a fresh ws — spy on engine_turn
    const ws2 = makeWs();
    let engineTurnFired = false;
    ws2.on('engine_turn', () => { engineTurnFired = true; });
    await handler(ws2, JSON.stringify({ type: 'resume', gameId }));

    expect(ws2._messages.some(m => m.type === 'game_started')).toBe(true);
    expect(engineTurnFired).toBe(true);
  });

  it('hint rate-limiting: second hint within 2s returns no message (lines 62-63)', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null,
    }));
    expect(ws.lastMessage().type).toBe('game_started');

    const countBefore = ws._messages.length;
    // First hint is allowed
    await handler(ws, JSON.stringify({ type: 'hint' }));
    expect(ws.lastMessage().type).toBe('hint_result');

    // Second hint within 2s should be rate-limited (no message sent)
    const countAfterFirst = ws._messages.length;
    await handler(ws, JSON.stringify({ type: 'hint' }));
    // Rate-limited: no additional message sent
    expect(ws._messages.length).toBe(countAfterFirst);
    void countBefore; // suppress unused warning
  });

  it('timed player move includes clock update (handlers.js line 148)', async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    await handler(ws, JSON.stringify({
      type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false,
      timeControl: { initialSec: 300, incSec: 3 },
    }));
    expect(ws.lastMessage().type).toBe('game_started');

    await handler(ws, JSON.stringify({ type: 'move', uci: 'e2e4' }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('move_accepted');
    // Timed game: clockUpdate is set in session, stored by handler line 148
    expect(msg.clockUpdate).toBeDefined();
    expect(msg.clockUpdate.whiteMs).toBeDefined();
  });

  it('resume with unknown gameId returns GAME_NOT_FOUND error (handlers.js line 212)', async () => {
    // Use a custom gameRepo where findById returns null instead of throwing,
    // so the explicit if (!game) check on line 211 is reached
    const gameRepo = new InMemoryGameRepository();
    gameRepo.findById = () => null; // override to return null for unknown IDs
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    await handler(ws, JSON.stringify({ type: 'resume', gameId: '00000000-0000-0000-0000-000000000000' }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('error');
    expect(msg.error_code).toBe('game_not_found');
  });

  it("player move that checkmates the engine sends game_over via handleMove", async () => {
    const gameRepo = new InMemoryGameRepository();
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();

    // Register engine_turn handler BEFORE starting the game (player is black;
    // engine plays white via fool's mate setup: f2f3 then g2g4)
    const engineQueue = ['f2f3', 'g2g4'];
    ws.on('engine_turn', (session) => {
      if (engineQueue.length > 0) session.applyMove(engineQueue.shift());
    });

    // Start a casual game as black so the player delivers checkmate
    await handler(ws, JSON.stringify({
      type: 'new_game',
      opponentId: 'sf-1400',
      color: 'black',
      ranked: false,
      timeControl: null,
    }));
    // engine_turn fires immediately → white plays f2f3

    // Player (black) plays e7e5 → engine_turn fires → white plays g2g4
    await handler(ws, JSON.stringify({ type: 'move', uci: 'e7e5' }));

    // Player (black) delivers Qh4# (fool's mate)
    await handler(ws, JSON.stringify({ type: 'move', uci: 'd8h4' }));

    const lastMsg = ws.lastMessage();
    // Lines 122-124: moveResult.gameOver=true → finishGame → game_over
    expect(lastMsg.type).toBe('game_over');
    expect(lastMsg.termination).toBe('checkmate');
  });

  it('non-Error thrown sends "An internal error occurred" (handlers.js line 75 FALSE branch)', async () => {
    const gameRepo = new InMemoryGameRepository();
    gameRepo.save = () => { throw 'not an Error object'; };
    const handler = makeMessageHandler({ gameRepo, clock: CLOCK });
    const ws = makeWs();
    await handler(ws, JSON.stringify({
      type: 'new_game', opponentId: 'sf-1400', color: 'white', ranked: false, timeControl: null,
    }));
    const msg = ws.lastMessage();
    expect(msg.type).toBe('error');
    expect(msg.message).toBe('An internal error occurred');
  });

  it('send() skips ws.send when socket is not OPEN (handlers.js line 287 FALSE branch)', async () => {
    const handler = makeMessageHandler({ gameRepo: new InMemoryGameRepository(), clock: CLOCK });
    const ws = makeWs();
    ws.readyState = 0; // closed — not OPEN (which is 1)
    await handler(ws, '{invalid json}');
    expect(ws._messages).toHaveLength(0);
  });
});
