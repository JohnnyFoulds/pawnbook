/**
 * @module api/ws/connection
 * WebSocket server setup — attaches to the HTTP server and dispatches engine turns.
 *
 * Engine dispatch: handlers.js emits 'engine_turn' on the ws object so it stays
 * decoupled from the engine layer. This module listens for that event and drives
 * the UCI engine client.
 */

import { WebSocketServer } from 'ws';

import { logger } from '../../config.js';
import { INCREMENTAL_MAX_QUEUE } from '../../shared/balance.js';

import { makeMessageHandler } from './handlers.js';
import { analyseGame } from './analysis-service.js';

const log = logger.child({ mod: 'ws-connection' });

/**
 * @param {object} opts
 * @param {import('http').Server} opts.httpServer
 * @param {import('../../ports/repositories.js').GameRepository} opts.gameRepo
 * @param {import('../../ports/repositories.js').PuzzleRepository} opts.puzzleRepo
 * @param {import('../../adapters/sqlite/repositories.js').SqliteSettingsRepository} opts.settingsRepo
 * @param {import('../../ports/clock.js').Clock} opts.clock
 * @param {object|null} opts.enginePool — engine dispatch function; null in test/dev without engines
 * @returns {WebSocketServer}
 */
export function attachWebSocketServer({ httpServer, gameRepo, puzzleRepo, settingsRepo, clock, enginePool }) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 4096 });
  const handleMessage = makeMessageHandler({ gameRepo, settingsRepo, clock, enginePool });

  wss.on('connection', (ws, req) => {
    log.info({ remoteAddress: req.socket.remoteAddress }, 'ws connected');
    let _incrementalPending = 0;

    /**
     * Queue a background pre-eval for the given position if the queue has room.
     * Drops silently when the cap is reached to prevent blocking post-game analysis.
     */
    function queuePreEval(gameId, ply, fen) {
      if (!gameRepo.savePreEval) return;
      // Drop new pre-evals when the queue is full — prevents 60+ jobs from
      // blocking the post-game analysis SF client for minutes.
      if (_incrementalPending >= INCREMENTAL_MAX_QUEUE) return;
      _incrementalPending++;
      enginePool.getAnalysisSfClient()
        // movetime caps each pre-eval so the queue drains in ≤ MAX_QUEUE × 1.5s
        .then(sfClient => sfClient.eval(fen, { movetime: 1500 }))
        .then(r => gameRepo.savePreEval(gameId, ply, fen, r))
        .catch(err => log.debug({ err, gameId }, 'incremental pre-eval failed'))
        .finally(() => { _incrementalPending--; });
    }

    // Pre-eval after the player's move (position the engine will now face)
    ws.on('player_move_pre_eval', ({ gameId, ply, fen }) => {
      if (!enginePool) return;
      queuePreEval(gameId, ply, fen);
    });

    // Wire the engine dispatch once per connection
    ws.on('engine_turn', async (session) => {
      if (!enginePool) {
        log.warn({ gameId: session.id }, 'engine_turn fired but no engine pool — skipping');
        return;
      }
      try {
        const result = await enginePool.requestMove(session);
        if (!result) return; // game ended or cancelled
        log.debug({ gameId: session.id, uci: result.uci }, 'engine move');
        const move = session.applyMove(result.uci);

        // Persist the engine's move and live clock state
        gameRepo.appendMove(session.id, session.moves[session.moves.length - 1]);
        if (move.clockUpdate) {
          gameRepo.updateClock(session.id, move.clockUpdate.whiteMs, move.clockUpdate.blackMs);
        }

        const reply = {
          type: 'engine_move',
          uci: result.uci,
          san: move.san,
          fen: move.fen,
          legalMoves: move.legalMoves,
          check: move.check,
        };

        if (move.clockUpdate) {
          reply.clock = move.clockUpdate;
        }

        if (move.gameOver && move.result) {
          gameRepo.save({
            id: session.id,
            opponentId: session.opponent.id,
            opponentElo: session.opponent.elo,
            playerColor: session.playerColor,
            ranked: session.ranked,
            status: 'finished',
            result: move.result.result,
            termination: move.result.termination,
            playedAt: Date.now(),
          });
          reply.gameOver = { result: move.result.result, termination: move.result.termination };
          ws.send(JSON.stringify(reply));
          // ELO is computed by analyseGame; initial game_over carries null ELO
          send(ws, {
            type: 'game_over',
            result: move.result.result,
            termination: move.result.termination,
            eloBefore: null,
            eloAfter: null,
          });
          ws.emit('game_finished', { session, result: move.result });
          return;
        }

        // Background incremental pre-eval of the position the player will now ponder (FR-ANALYSE-9/12)
        if (!move.gameOver) {
          queuePreEval(session.id, session.moves.length + 1, move.fen);
        }

        send(ws, reply);
      } catch (err) {
        log.error({ err, gameId: session.id }, 'engine move failed');
        send(ws, {
          type: 'error',
          error_code: 'engine_unavailable',
          message: 'Engine move failed',
          detail: {},
        });
      }
    });

    // Trigger background analysis after any game ends
    ws.on('game_finished', ({ session, result }) => {
      if (!enginePool) {
        log.warn({ gameId: session.id }, 'game_finished but no engine pool — skipping analysis');
        return;
      }
      log.info({ gameId: session.id, result: result.result }, 'triggering post-game analysis');
      analyseGame({ gameId: session.id, session, result, ws, gameRepo, puzzleRepo, settingsRepo, enginePool })
        .catch(err => log.error({ err, gameId: session.id }, 'analyseGame threw unexpectedly'));
    });

    ws.on('message', (raw) => handleMessage(ws, raw.toString()));

    ws.on('close', () => {
      log.info({ remoteAddress: req.socket.remoteAddress }, 'ws disconnected');
    });

    ws.on('error', (err) => {
      log.error({ err, remoteAddress: req.socket.remoteAddress }, 'ws error');
    });
  });

  return wss;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}
