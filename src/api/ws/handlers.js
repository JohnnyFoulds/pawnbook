/**
 * @module api/ws/handlers
 * WebSocket message handlers. Stateless functions — session state lives in GameSession.
 */

import { randomUUID } from 'crypto';

import { ZodError } from 'zod';

import { InboundMessageSchema } from '../../schemas/messages.js';
import { GameSession } from '../../domain/game/session.js';
import { getOpponent } from '../../domain/game/roster.js';
import { ErrorCode } from '../../errors.js';
import { logger } from '../../config.js';

const log = logger.child({ mod: 'ws-handlers' });

/**
 * @param {object} deps
 * @param {import('../../ports/repositories.js').GameRepository} deps.gameRepo
 * @param {import('../../ports/clock.js').Clock} deps.clock
 * @returns {(ws: import('ws').WebSocket, raw: string) => Promise<void>}
 */
export function makeMessageHandler({ gameRepo, clock }) {
  /** @type {Map<string, GameSession>} ws-scoped active sessions */
  const sessions = new Map();

  return async function handleMessage(ws, raw) {
    // Register cleanup once per ws object so sessions Map doesn't grow unboundedly
    if (!ws._pawnbookTracked && typeof ws.once === 'function') {
      ws._pawnbookTracked = true;
      ws.once('close', () => sessions.delete(ws));
    }

    let msg;
    try {
      msg = InboundMessageSchema.parse(JSON.parse(raw));
    } catch (err) {
      return send(ws, {
        type: 'error',
        error_code: ErrorCode.VALIDATION_FAILED,
        message: err instanceof ZodError ? err.errors[0].message : 'Invalid message',
        detail: {},
      });
    }

    try {
      switch (msg.type) {
        case 'new_game': return await handleNewGame(ws, msg, { gameRepo, clock, sessions });
        case 'move':     return await handleMove(ws, msg, { gameRepo, sessions });
        case 'resign':   return await handleResign(ws, { gameRepo, sessions });
        case 'hint':     return await handleHint(ws, { sessions });
        case 'resume':   return await handleResume(ws, msg, { gameRepo, clock, sessions });
      }
    } catch (err) {
      log.error({ err }, 'ws handler error');
      send(ws, {
        type: 'error',
        error_code: 'internal_error',
        message: err.message,
        detail: {},
      });
    }
  };
}

// ─── handlers ────────────────────────────────────────────────────────────────

async function handleNewGame(ws, msg, { gameRepo, clock, sessions }) {
  const opponent = getOpponent(msg.opponentId);

  let playerColor = msg.color;
  if (playerColor === 'random') playerColor = Math.random() < 0.5 ? 'white' : 'black';

  const session = new GameSession({
    gameId: randomUUID(),
    opponent,
    playerColor,
    ranked: msg.ranked,
    timeControl: msg.timeControl ?? null,
    clock,
  });

  gameRepo.save({
    id: session.id,
    opponentId: opponent.id,
    opponentElo: opponent.elo,
    playerColor,
    ranked: session.ranked,
    status: 'in_progress',
    timeControlInitialSec: msg.timeControl?.initialSec ?? null,
    timeControlIncSec: msg.timeControl?.incSec ?? null,
    clockWhiteMs: session._clockWhiteMs,
    clockBlackMs: session._clockBlackMs,
  });

  sessions.set(ws, session);

  log.info({ gameId: session.id, opponentId: opponent.id, playerColor, ranked: session.ranked }, 'game started');

  const reply = {
    type: 'game_started',
    gameId: session.id,
    fen: session.fen,
    youPlay: playerColor,
    legalMoves: session.legalMoves,
  };
  if (msg.timeControl) {
    reply.clock = { whiteMs: session._clockWhiteMs, blackMs: session._clockBlackMs };
  }

  send(ws, reply);

  // If player is Black, engine moves first
  if (playerColor === 'black') {
    // Engine move deferred to engine integration (Phase 5 stub: emit placeholder)
    // Full engine dispatch happens in ws/connection.js where the engine pool is available
    ws.emit('engine_turn', session);
  }
}

async function handleMove(ws, msg, { gameRepo, sessions }) {
  const session = sessions.get(ws);
  if (!session) return sendError(ws, 'no active game');

  log.debug({ gameId: session.id, uci: msg.uci }, 'player move');

  const moveResult = session.applyMove(msg.uci);

  // Persist the move
  gameRepo.appendMove(session.id, session.moves[session.moves.length - 1]);

  if (moveResult.gameOver) {
    finishGame(ws, session, moveResult.result, gameRepo);
    return;
  }

  send(ws, {
    type: 'move_accepted',
    fen: moveResult.fen,
    san: moveResult.san,
    legalMoves: moveResult.legalMoves,
    check: moveResult.check,
    clockUpdate: moveResult.clockUpdate,
  });

  // Signal that the engine should now move
  ws.emit('engine_turn', session);
}

async function handleResign(ws, { gameRepo, sessions }) {
  const session = sessions.get(ws);
  if (!session) return sendError(ws, 'no active game');
  log.info({ gameId: session.id }, 'player resigned');
  const result = session.resign();
  finishGame(ws, session, result, gameRepo);
}

async function handleHint(ws, { sessions }) {
  const session = sessions.get(ws);
  if (!session) return sendError(ws, 'no active game');
  session.assertHintAllowed(); // throws HintNotAllowedError if ranked
  // Hint piece selection is resolved by the engine layer; stub response here
  // pieceSquare must be a non-null string — TUI calls .slice(0,1) on it
  send(ws, { type: 'hint_result', pieceSquare: 'a1' });
}

async function handleResume(ws, msg, { gameRepo, clock, sessions }) {
  const game = gameRepo.findById(msg.gameId);
  const savedMoves = gameRepo.getMoves(msg.gameId);
  const opponent = getOpponent(game.opponentId);

  const session = GameSession.fromMoves({
    gameId: game.id,
    opponent,
    playerColor: game.playerColor,
    ranked: game.ranked,
    timeControl: game.timeControlInitialSec
      ? { initialSec: game.timeControlInitialSec, incSec: game.timeControlIncSec }
      : null,
    status: game.status,
    clock,
    savedClockWhiteMs: game.clockWhiteMs,
    savedClockBlackMs: game.clockBlackMs,
  }, savedMoves);

  sessions.set(ws, session);

  log.info({ gameId: msg.gameId, ply: savedMoves.length, opponentId: game.opponentId }, 'game resumed');

  const reply = {
    type: 'game_started',
    gameId: session.id,
    fen: session.fen,
    youPlay: game.playerColor,
    // Send empty legalMoves if it's the engine's turn so the client doesn't
    // allow player input while waiting for the engine reply.
    legalMoves: session.isPlayerTurn ? session.legalMoves : [],
    resumed: true,
  };
  if (game.timeControlInitialSec) {
    reply.clock = { whiteMs: game.clockWhiteMs, blackMs: game.clockBlackMs };
  }
  send(ws, reply);

  // Trigger engine if it was the engine's turn when the session was interrupted.
  if (!session.isPlayerTurn) {
    ws.emit('engine_turn', session);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function finishGame(ws, session, result, gameRepo) {
  log.info({ gameId: session.id, result: result.result, termination: result.termination }, 'game finished');
  gameRepo.save({
    id: session.id,
    opponentId: session.opponent.id,
    opponentElo: session.opponent.elo,
    playerColor: session.playerColor,
    ranked: session.ranked,
    status: 'finished',
    result: result.result,
    termination: result.termination,
    playedAt: Date.now(),
  });

  send(ws, {
    type: 'game_over',
    result: result.result,
    termination: result.termination,
    eloBefore: null,
    eloAfter: null,
  });

  // Signal connection.js to trigger background analysis
  ws.emit('game_finished', { session, result });
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function sendError(ws, message) {
  send(ws, { type: 'error', error_code: 'internal_error', message, detail: {} });
}
