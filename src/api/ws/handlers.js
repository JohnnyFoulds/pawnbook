/**
 * @module api/ws/handlers
 * WebSocket message handlers. Stateless functions — session state lives in GameSession.
 */

import { randomUUID } from 'crypto';

import { ZodError } from 'zod';

import { InboundMessageSchema } from '../../schemas/messages.js';
import { GameSession } from '../../domain/game/session.js';
import { getOpponent } from '../../domain/game/roster.js';
import { ErrorCode, errorCodeFor } from '../../errors.js';
import { extractEpd, sideFromFen } from '../../domain/repertoire/epd.js';
import { ALERTING_SET } from '../../domain/repertoire/state.js';
import {
  REP_BOOTSTRAP_CONFIRMED_MIN,
  REP_ALERTS_PER_GAME_MAX,
  REP_ALERT_TIMEOUT_SEC,
} from '../../shared/balance.js';
import { RealTimer } from '../../adapters/scheduler/real-timer.js';
import { logger } from '../../config.js';

import { getProvenanceId } from './repertoire-service.js';

const log = logger.child({ mod: 'ws-handlers' });

const HINT_COOLDOWN_MS = 2000;

/**
 * @param {object} deps
 * @param {import('../../ports/repositories.js').GameRepository} deps.gameRepo
 * @param {import('../../ports/repositories.js').SettingsRepository} deps.settingsRepo
 * @param {import('../../ports/clock.js').Clock} deps.clock
 * @param {object|null} [deps.enginePool]
 * @param {object|null} [deps.repertoireRepo]
 * @param {import('../../ports/scheduler.js').Scheduler} [deps.scheduler] — alert timeouts;
 *   defaults to RealTimer (production). Inject ManualTimer in tests/journey harness.
 * @returns {(ws: import('ws').WebSocket, raw: string) => Promise<void>}
 */
export function makeMessageHandler({ gameRepo, settingsRepo, clock, enginePool = null, repertoireRepo = null, scheduler = null }) {
  const _scheduler = scheduler ?? new RealTimer();
  /** @type {Map<string, GameSession>} ws-scoped active sessions */
  const sessions = new Map();
  /** @type {WeakMap<object, number>} per-connection last-hint timestamp for rate-limiting */
  const hintLastMs = new WeakMap();
  /** @type {WeakMap<object, object>} per-connection pending pre-commit move state */
  const pendingMoves = new WeakMap();
  /** @type {WeakMap<object, ReturnType<typeof setTimeout>>} per-connection alert timeout handles */
  const alertTimeouts = new WeakMap();

  const deps = { gameRepo, settingsRepo, sessions, pendingMoves, alertTimeouts, repertoireRepo, scheduler: _scheduler };

  return async function handleMessage(ws, raw) {
    // Register cleanup once per ws object so sessions Map doesn't grow unboundedly
    if (!ws._pawnbookTracked && typeof ws.once === 'function') {
      ws._pawnbookTracked = true;
      ws.once('close', () => {
        sessions.delete(ws);
        const handle = alertTimeouts.get(ws);
        if (handle) _scheduler.cancel(handle);
        alertTimeouts.delete(ws);
        pendingMoves.delete(ws);
      });
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
        case 'new_game':          return await handleNewGame(ws, msg, { gameRepo, clock, sessions });
        case 'move':              return await handleMove(ws, msg, deps);
        case 'resign':            return await handleResign(ws, deps);
        case 'repertoire_choice': return await handleRepertoireChoice(ws, msg, deps);
        case 'hint': {
          const now = Date.now();
          const last = hintLastMs.get(ws) ?? 0;
          if (now - last < HINT_COOLDOWN_MS) {
            log.debug({ gameId: sessions.get(ws)?.id }, 'hint rate-limited');
            return;
          }
          hintLastMs.set(ws, now);
          return await handleHint(ws, { sessions, enginePool });
        }
        case 'resume': return await handleResume(ws, msg, { gameRepo, clock, sessions });
      }
    } catch (err) {
      log.error({ err }, 'ws handler error');
      send(ws, {
        type: 'error',
        error_code: errorCodeFor(err),
        message: err instanceof Error ? err.message : 'An internal error occurred',
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

  const coachEnabled = msg.coachEnabled !== false;

  const session = new GameSession({
    gameId: randomUUID(),
    opponent,
    playerColor,
    ranked: msg.ranked,
    timeControl: msg.timeControl ?? null,
    clock,
  });
  session.coachEnabled = coachEnabled;

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
    coachEnabled: coachEnabled ? 1 : 0,
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
    ws.emit('engine_turn', session);
  }
}

async function handleMove(ws, msg, { gameRepo, settingsRepo, sessions, pendingMoves, alertTimeouts, repertoireRepo, scheduler }) {
  const session = sessions.get(ws);
  if (!session) return sendError(ws, 'no active game');

  // Ignore moves while a repertoire_choice is pending
  if (pendingMoves.has(ws)) return;

  log.debug({ gameId: session.id, uci: msg.uci }, 'player move');

  // Pre-commit book check (only on player turns with an active repo)
  if (repertoireRepo && session.isPlayerTurn) {
    const held = await _checkBookAlert(ws, msg.uci, session,
      { sessions, pendingMoves, alertTimeouts, gameRepo, settingsRepo, repertoireRepo, scheduler });
    if (held) return;
  }

  const moveResult = session.applyMove(msg.uci);

  // Persist the move and live clock state
  gameRepo.appendMove(session.id, session.moves[session.moves.length - 1]);
  if (moveResult.clockUpdate) {
    gameRepo.updateClock(session.id, moveResult.clockUpdate.whiteMs, moveResult.clockUpdate.blackMs);
  }

  if (moveResult.gameOver) {
    finishGame(ws, session, moveResult.result, gameRepo, settingsRepo);
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

async function handleRepertoireChoice(ws, msg, { gameRepo, settingsRepo, sessions, pendingMoves, alertTimeouts, repertoireRepo, scheduler }) {
  const session = sessions.get(ws);
  if (!session) return sendError(ws, 'no active game');

  const pending = pendingMoves.get(ws);
  if (!pending) {
    return send(ws, {
      type: 'error',
      error_code: ErrorCode.NO_PENDING_MOVE,
      message: 'No pending move awaiting choice',
      detail: {},
    });
  }

  // Clear the alert timeout
  const handle = alertTimeouts.get(ws);
  if (handle) scheduler.cancel(handle);
  alertTimeouts.delete(ws);
  pendingMoves.delete(ws);

  const decisionMs = Date.now() - pending.alertedAt;
  const uciToApply = msg.choice === 'correct' ? pending.bookUci : pending.uci;
  const resolution = msg.choice === 'correct' ? 'alerted_corrected' : 'alerted_kept';
  const openChallenge = resolution === 'alerted_kept' && pending.kind === 'refused_repeat';

  await _applyChoiceMove(ws, session, uciToApply,
    { resolution, decisionMs, pending, openChallenge, gameRepo, settingsRepo, repertoireRepo });
}

async function handleResign(ws, { gameRepo, settingsRepo, sessions, pendingMoves, alertTimeouts, scheduler }) {
  const session = sessions.get(ws);
  if (!session) return sendError(ws, 'no active game');

  // Clear any pending alert before resigning
  const handle = alertTimeouts.get(ws);
  if (handle) scheduler.cancel(handle);
  alertTimeouts.delete(ws);
  pendingMoves.delete(ws);

  log.info({ gameId: session.id }, 'player resigned');
  const result = session.resign();
  finishGame(ws, session, result, gameRepo, settingsRepo);
}

async function handleHint(ws, { sessions, enginePool }) {
  const session = sessions.get(ws);
  if (!session) return sendError(ws, 'no active game');
  session.assertHintAllowed(); // throws HintNotAllowedError if ranked

  if (enginePool) {
    try {
      const sfClient = await enginePool.getAnalysisSfClient();
      const result = await sfClient.eval(session.fen, { depth: 10 });
      if (!result.bestmove) {
        log.warn({ gameId: session.id, fen: session.fen }, 'hint engine returned no bestmove — falling back to a1');
        send(ws, { type: 'hint_result', pieceSquare: 'a1' });
        return;
      }
      send(ws, { type: 'hint_result', pieceSquare: result.bestmove.slice(0, 2) });
      return;
    } catch (err) {
      log.warn({ err, gameId: session.id }, 'hint engine eval failed — falling back to a1');
    }
  } else {
    log.warn({ gameId: session.id }, 'hint requested but no engine pool available — falling back to a1');
  }
  send(ws, { type: 'hint_result', pieceSquare: 'a1' });
}

async function handleResume(ws, msg, { gameRepo, clock, sessions }) {
  const game = gameRepo.findById(msg.gameId);
  if (!game) {
    return send(ws, { type: 'error', error_code: ErrorCode.GAME_NOT_FOUND, message: `Game '${msg.gameId}' not found`, detail: {} });
  }
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

  session.coachEnabled = game.coachEnabled !== false;
  sessions.set(ws, session);

  log.info({ gameId: msg.gameId, ply: savedMoves.length, opponentId: game.opponentId }, 'game resumed');

  const reply = {
    type: 'game_started',
    gameId: session.id,
    fen: session.fen,
    youPlay: game.playerColor,
    legalMoves: session.isPlayerTurn ? session.legalMoves : [],
    resumed: true,
  };
  if (game.timeControlInitialSec) {
    reply.clock = { whiteMs: game.clockWhiteMs, blackMs: game.clockBlackMs };
  }
  send(ws, reply);

  if (!session.isPlayerTurn) {
    ws.emit('engine_turn', session);
  }
}

// ─── coach helpers ────────────────────────────────────────────────────────────

/**
 * Pre-commit book check. Returns true if the move was held (alert sent), false otherwise.
 */
async function _checkBookAlert(ws, uci, session, deps) {
  const { pendingMoves, alertTimeouts, scheduler } = deps;

  if (session.coachEnabled === false) return false;
  const confirmedCount = deps.repertoireRepo.listNodes().filter(n => n.encounters >= 2).length;
  if (confirmedCount < REP_BOOTSTRAP_CONFIRMED_MIN) return false;
  if (session.alertsInGame >= REP_ALERTS_PER_GAME_MAX) return false;

  const epd = extractEpd(session.fen);
  const side = sideFromFen(session.fen);
  const playerMove = deps.repertoireRepo.getMove(epd, side, uci);
  if (!playerMove || !ALERTING_SET.has(playerMove.role)) return false;

  const bookMoves = deps.repertoireRepo.getMovesForNode(epd, side);
  const canonical = bookMoves.find(m => m.role === 'canonical') ?? bookMoves.find(m => m.role === 'alt');
  if (!canonical) return false;

  const kind = playerMove.role === 'refused' ? 'refused_repeat' : 'lapse';
  const legalMoves = session.legalMoves;
  const playerSan = legalMoves.find(m => m.uci === uci)?.san ?? uci;
  const bookSan = legalMoves.find(m => m.uci === canonical.moveUci)?.san ?? canonical.moveUci;

  if (session.ranked) session.setUnranked();
  session.alertsInGame++;

  pendingMoves.set(ws, {
    uci,
    san: playerSan,
    ply: session.moves.length + 1,
    fen: session.fen,
    epd,
    side,
    bookUci: canonical.moveUci,
    bookSan,
    kind,
    alertedAt: Date.now(),
  });

  const handle = scheduler.schedule(() => _handleAlertTimeout(ws, deps), REP_ALERT_TIMEOUT_SEC * 1000);
  alertTimeouts.set(ws, handle);

  send(ws, {
    type: 'repertoire_alert',
    kind,
    playerUci: uci,
    playerSan,
    bookUci: canonical.moveUci,
    bookSan,
    costWinPts: playerMove.meanWinLossPts ?? 0,
  });

  return true;
}

/**
 * Apply a move chosen via repertoire_choice (or auto-applied on timeout).
 */
async function _applyChoiceMove(ws, session, uci, { resolution, decisionMs, pending, openChallenge, gameRepo, settingsRepo, repertoireRepo }) {
  // Pause clock: reset baseline so alert display time is not charged
  session.resetClockBaseline();
  const moveResult = session.applyMove(uci);
  const gameMove = session.moves[session.moves.length - 1];

  if (repertoireRepo) {
    try {
      const provenanceId = getProvenanceId(repertoireRepo);
      const bookVersion = repertoireRepo.getCurrentBookVersion();
      repertoireRepo.transaction(() => {
        gameRepo.appendMove(session.id, gameMove);
        if (moveResult.clockUpdate) {
          gameRepo.updateClock(session.id, moveResult.clockUpdate.whiteMs, moveResult.clockUpdate.blackMs);
        }
        repertoireRepo.appendDeviation({
          id: randomUUID(),
          gameId: session.id,
          ply: pending.ply,
          epd: pending.epd,
          kind: pending.kind,
          playedUci: uci,
          bookUci: pending.bookUci,
          resolution,
          decisionMsTaken: decisionMs,
          provenanceId,
          bookVersion,
        });
        if (openChallenge) {
          repertoireRepo.openChallenge({
            id: randomUUID(),
            epd: pending.epd,
            side: pending.side,
            fen: pending.fen,
            incumbentUci: pending.bookUci,
            challengerUci: pending.uci,
            openedGameId: session.id,
            openedPly: pending.ply,
            openedAt: Date.now(),
            status: 'open',
            provenanceId,
            bookVersion,
          });
        }
      });
    } catch (err) {
      log.warn({ err }, 'failed to persist deviation — swallowed');
      gameRepo.appendMove(session.id, gameMove);
      if (moveResult.clockUpdate) {
        gameRepo.updateClock(session.id, moveResult.clockUpdate.whiteMs, moveResult.clockUpdate.blackMs);
      }
    }
  } else {
    gameRepo.appendMove(session.id, gameMove);
    if (moveResult.clockUpdate) {
      gameRepo.updateClock(session.id, moveResult.clockUpdate.whiteMs, moveResult.clockUpdate.blackMs);
    }
  }

  if (moveResult.gameOver) {
    finishGame(ws, session, moveResult.result, gameRepo, settingsRepo);
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
  ws.emit('engine_turn', session);
}

/**
 * Called when the 60-second alert timeout fires.
 * Auto-applies the player's original move; records deviation; opens NO challenge (invariant 15).
 */
function _handleAlertTimeout(ws, deps) {
  const { sessions, pendingMoves, alertTimeouts, gameRepo, settingsRepo, repertoireRepo } = deps;

  const session = sessions.get(ws);
  const pending = pendingMoves.get(ws);
  if (!session || !pending) return;

  pendingMoves.delete(ws);
  alertTimeouts.delete(ws);

  session.resetClockBaseline();
  let moveResult;
  try {
    moveResult = session.applyMove(pending.uci);
  } catch (err) {
    log.warn({ err, gameId: session?.id }, 'timeout move application failed');
    return;
  }
  const gameMove = session.moves[session.moves.length - 1];

  if (repertoireRepo) {
    try {
      const provenanceId = getProvenanceId(repertoireRepo);
      const bookVersion = repertoireRepo.getCurrentBookVersion();
      repertoireRepo.transaction(() => {
        gameRepo.appendMove(session.id, gameMove);
        if (moveResult.clockUpdate) {
          gameRepo.updateClock(session.id, moveResult.clockUpdate.whiteMs, moveResult.clockUpdate.blackMs);
        }
        // Invariant 15: timeout deviations open NO challenge
        repertoireRepo.appendDeviation({
          id: randomUUID(),
          gameId: session.id,
          ply: pending.ply,
          epd: pending.epd,
          kind: pending.kind,
          playedUci: pending.uci,
          bookUci: pending.bookUci,
          resolution: 'alerted_timeout',
          decisionMsTaken: null,
          provenanceId,
          bookVersion,
        });
      });
    } catch (err) {
      log.warn({ err }, 'timeout deviation record failed — swallowed');
      gameRepo.appendMove(session.id, gameMove);
    }
  } else {
    gameRepo.appendMove(session.id, gameMove);
  }

  if (moveResult.gameOver) {
    finishGame(ws, session, moveResult.result, gameRepo, settingsRepo);
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
  ws.emit('engine_turn', session);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function finishGame(ws, session, result, gameRepo, _settingsRepo) {
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

  // ELO is computed by analyseGame after analysis completes; initial game_over carries null ELO
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
