/**
 * @module adapters/engine/engine-pool
 * Engine pool: one persistent UCI client per opponent type.
 * Provides requestMove(session) for the WebSocket game loop.
 *
 * Maia   — lc0 policy head, movetime 200 ms (pure policy at low nodes)
 * Stockfish — strength-limited by UCI_Elo
 * Drawfish  — bestmove (plays for stalemate)
 */

import { EngineUnavailableError } from '../../errors.js';
import { ENGINE_PATHS, WEIGHTS_DIR, logger } from '../../config.js';

import { createUciEngineClient } from './uci-engine-client.js';

const log = logger.child({ mod: 'engine-pool' });

const CIRCUIT_MAX_FAILURES = 3;

// Stockfish UCI_Elo per opponent id
const SF_ELO = {
  'sf-1400': 1400,
  'sf-1700': 1700,
  'sf-2000': 2000,
  'sf-2300': 2300,
  'sf-2600': 2600,
  'sf-2900': 2900,
  'sf-max':  null, // full strength
};

const MAIA_MOVETIME_MS = 200;
const SF_MOVETIME_MS   = 500;

/**
 * Compute safe engine movetime: min(engineRemainder - 300ms, SF_MOVETIME_MS).
 * Prevents the engine from flagging itself on low time controls.
 * @param {object} session
 * @returns {number} movetime in ms
 */
export function engineMovetime(session) {
  if (!session.timeControl) return SF_MOVETIME_MS;
  const engineColor = session.playerColor === 'white' ? 'black' : 'white';
  const engineMs = engineColor === 'white' ? session._clockWhiteMs : session._clockBlackMs;
  if (engineMs == null || engineMs <= 0) return SF_MOVETIME_MS;
  return Math.min(Math.max(100, engineMs - 300), SF_MOVETIME_MS);
}

/**
 * Create and return an engine pool.
 * Clients are lazily started and cached for the process lifetime.
 *
 * @returns {{ requestMove(session: object): Promise<{uci: string}> }}
 */
export function createEnginePool() {
  /** @type {Map<string, import('./uci-engine-client.js').UciEngineClient>} */
  const pool = new Map();
  /** @type {Map<string, number>} consecutive spawn-failure count per key */
  const failures = new Map();

  async function getClient(key, binary, args = []) {
    if ((failures.get(key) ?? 0) >= CIRCUIT_MAX_FAILURES) {
      throw new EngineUnavailableError(
        `Engine '${binary}' circuit open after ${CIRCUIT_MAX_FAILURES} consecutive failures`
      );
    }
    if (pool.has(key)) return pool.get(key);
    try {
      log.info({ key, binary }, 'starting engine');
      const client = await createUciEngineClient(binary, args);
      failures.set(key, 0);
      // Evict dead client from pool so the next request spawns a fresh one
      client._proc?.once('close', () => {
        if (pool.get(key) === client) {
          log.warn({ key }, 'engine process died — evicting from pool');
          pool.delete(key);
        }
      });
      pool.set(key, client);
      return client;
    } catch (err) {
      failures.set(key, (failures.get(key) ?? 0) + 1);
      log.error({ err, key, failures: failures.get(key) }, 'engine start failed');
      throw err;
    }
  }

  return {
    /**
     * @param {object} session - GameSession with .opponent and .fen
     * @returns {Promise<{uci: string}>}
     */
    async requestMove(session) {
      const { opponent, fen } = session;

      if (opponent.type === 'maia') {
        const weightsPath = `${WEIGHTS_DIR}/${opponent.id}.pb.gz`;
        const client = await getClient(
          opponent.id,
          ENGINE_PATHS.lc0,
          [`--weights=${weightsPath}`]
        );
        const result = await client.eval(fen, { movetime: MAIA_MOVETIME_MS });
        return { uci: result.bestmove };
      }

      if (opponent.type === 'stockfish') {
        const client = await getClient('stockfish', ENGINE_PATHS.stockfish);
        const targetElo = SF_ELO[opponent.id];
        if (targetElo !== null && targetElo !== undefined) {
          client._write('setoption name UCI_LimitStrength value true\n');
          client._write(`setoption name UCI_Elo value ${targetElo}\n`);
        } else {
          client._write('setoption name UCI_LimitStrength value false\n');
        }
        const result = await client.eval(fen, { movetime: engineMovetime(session) });
        return { uci: result.bestmove };
      }

      if (opponent.type === 'drawfish') {
        if (!ENGINE_PATHS.drawfish) {
          throw new Error('Drawfish is not available in native mode (x86-64 ELF)');
        }
        const client = await getClient('drawfish', ENGINE_PATHS.drawfish);
        const result = await client.eval(fen, { movetime: engineMovetime(session) });
        return { uci: result.bestmove };
      }

      throw new Error(`Unknown opponent type: ${opponent.type}`);
    },

    /**
     * Get a dedicated Stockfish client for analysis (separate from game-play client).
     * @returns {Promise<import('./uci-engine-client.js').UciEngineClient>}
     */
    async getAnalysisSfClient() {
      const key = 'sf-analysis';
      if (pool.has(key)) return pool.get(key);
      log.info({ key }, 'starting analysis stockfish');
      const client = await createUciEngineClient(ENGINE_PATHS.stockfish);
      client.setOption('Threads', 6);
      client.setOption('Hash', 1024);
      pool.set(key, client);
      return client;
    },

    /**
     * Get an lc0/Maia client configured for findability probing.
     * Uses classic mode with VerboseMoveStats=true and PolicyTemperature=1.0.
     * @param {string} maiaId — e.g. 'maia-1300'
     * @returns {Promise<import('./uci-engine-client.js').UciEngineClient>}
     */
    async getMaiaAnalysisClient(maiaId) {
      const weightsPath = `${WEIGHTS_DIR}/${maiaId}.pb.gz`;
      const key = `maia-analysis-${maiaId}`;
      if (pool.has(key)) return pool.get(key);
      log.info({ key, maiaId }, 'starting maia analysis engine');
      const client = await createUciEngineClient(ENGINE_PATHS.lc0, [
        `--weights=${weightsPath}`,
      ]);
      // VerboseMoveStats and PolicyTemperature are UCI options, not command-line flags
      client.setOption('VerboseMoveStats', 'true');
      client.setOption('PolicyTemperature', '1.0');
      pool.set(key, client);
      return client;
    },

    /** Shut down all engine processes. */
    dispose() {
      for (const [key, client] of pool) {
        log.info({ key }, 'disposing engine');
        client.dispose();
      }
      pool.clear();
    },
  };
}
