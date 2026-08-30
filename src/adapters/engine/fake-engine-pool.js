/**
 * @module adapters/engine/fake-engine-pool
 * Deterministic engine pool for ENGINE_MODE=fake.
 * No engine binaries are spawned. Used by the journey harness and CI pipelines
 * that do not have Stockfish/lc0 installed.
 *
 * requestMove(): plays the first legal move from the current FEN.
 * getAnalysisSfClient(): returns a ScriptedEngineClient with fixed-cp responses.
 * getMaiaAnalysisClient(): returns a ScriptedEngineClient with a flat policy.
 *
 * The engine client shapes are deliberately identical to the real pool's clients
 * so `analyseGame` can run end-to-end without real engine calls.
 */

import { Chess } from 'chess.js';

import { ScriptedEngineClient } from './scripted-engine-client.js';

/**
 * Create a fake engine pool.
 * @param {object} [opts]
 * @param {number} [opts.cp=30] — centipawn score returned by the scripted SF client
 * @param {string|null} [opts.bestmove=null] — override bestmove; if null uses first legal
 */
export function createFakeEnginePool(opts = {}) {
  const fixedCp = opts.cp ?? 30;

  // Scripted SF client: returns the same fixed cp for every eval call.
  const sfClient = new ScriptedEngineClient({}, { defaultBestmove: 'e2e4' });
  // Override eval to return configurable cp and the actual first legal move.
  sfClient.eval = async (fen) => {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    const bestmove = moves.length ? moves[0].lan : 'e2e4';
    return { cp: fixedCp, mate: null, bestmove, pv: bestmove, lines: [] };
  };

  // Maia-like client: uniform policy over all legal moves.
  const maiaClient = new ScriptedEngineClient({}, { defaultBestmove: 'e2e4' });
  maiaClient.eval = async (fen) => {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    const bestmove = moves.length ? moves[0].lan : 'e2e4';
    return { cp: fixedCp, mate: null, bestmove, pv: bestmove, lines: [] };
  };
  maiaClient.policy = async (fen) => {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    if (!moves.length) return new Map();
    const prob = 1 / moves.length;
    return new Map(moves.map(m => [m.lan, prob]));
  };

  return {
    /**
     * Returns the first legal move at the current FEN.
     * @param {{ fen: string }} session
     * @returns {Promise<{uci: string}|null>}
     */
    async requestMove(session) {
      const chess = new Chess(session.fen);
      const moves = chess.moves({ verbose: true });
      if (!moves.length) return null;
      return { uci: moves[0].lan };
    },

    /** @returns {Promise<ScriptedEngineClient>} */
    async getAnalysisSfClient() { return sfClient; },

    /**
     * @param {string} _maiaId
     * @returns {Promise<ScriptedEngineClient>}
     */
    async getMaiaAnalysisClient(_maiaId) { return maiaClient; },

    dispose() {},
  };
}
