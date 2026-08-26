/**
 * @module api/ws/connection
 * WebSocket server setup — attaches to the HTTP server and dispatches engine turns.
 *
 * Engine dispatch: handlers.js emits 'engine_turn' on the ws object so it stays
 * decoupled from the engine layer. This module listens for that event and drives
 * the UCI engine client.
 */

import { WebSocketServer } from 'ws';

import { makeMessageHandler } from './handlers.js';
import { logger } from '../../config.js';

const log = logger.child({ mod: 'ws-connection' });

/**
 * @param {object} opts
 * @param {import('http').Server} opts.httpServer
 * @param {import('../../ports/repositories.js').GameRepository} opts.gameRepo
 * @param {import('../../ports/clock.js').Clock} opts.clock
 * @param {object|null} opts.enginePool — engine dispatch function; null in test/dev without engines
 * @returns {WebSocketServer}
 */
export function attachWebSocketServer({ httpServer, gameRepo, clock, enginePool }) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const handleMessage = makeMessageHandler({ gameRepo, clock });

  wss.on('connection', (ws, req) => {
    log.info({ remoteAddress: req.socket.remoteAddress }, 'ws connected');

    // Wire the engine dispatch once per connection
    ws.on('engine_turn', async (session) => {
      if (!enginePool) {
        log.warn({ gameId: session.id }, 'engine_turn fired but no engine pool — skipping');
        return;
      }
      try {
        const result = await enginePool.requestMove(session);
        if (!result) return; // game ended or cancelled
        const move = session.applyMove(result.uci);

        // Persist the engine's move
        gameRepo.appendMove(session.id, session.moves[session.moves.length - 1]);

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
          reply.gameOver = { result: move.result.result, termination: move.result.termination };
          ws.send(JSON.stringify(reply));
          send(ws, {
            type: 'game_over',
            result: move.result.result,
            termination: move.result.termination,
            eloBefore: null,
            eloAfter: null,
          });
          return;
        }

        send(ws, reply);
      } catch (err) {
        log.error({ err, gameId: session.id }, 'engine move failed');
        send(ws, {
          type: 'error',
          error_code: 'engine_unavailable',
          message: err.message,
          detail: {},
        });
      }
    });

    ws.on('message', (raw) => handleMessage(ws, raw.toString()));

    ws.on('close', () => {
      log.info({ remoteAddress: req.socket.remoteAddress }, 'ws disconnected');
    });

    ws.on('error', (err) => {
      log.error({ err }, 'ws error');
    });
  });

  return wss;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}
