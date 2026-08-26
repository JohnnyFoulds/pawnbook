/**
 * @module domain/analysis/findability
 * Maia findability probe — how likely is a player at a given ELO to find the best move?
 */

import { logger } from '../../config.js';

const log = logger.child({ mod: 'findability' });

/**
 * Probe Maia's policy distribution for a position and return findability metrics.
 *
 * @param {object} opts
 * @param {import('../../ports/engine-client.js').EngineClient} opts.maiaClient
 *   lc0 in classic mode with VerboseMoveStats=true, PolicyTemperature=1.0
 * @param {string} opts.fen
 * @param {string} opts.bestMoveUci — Stockfish's recommended move
 * @param {string} opts.playedMoveUci — the move the player actually made
 * @param {number} opts.winLossPts — win% loss for this position
 * @param {string} opts.maiaModel — which Maia weight file was used
 * @returns {Promise<{findability: number, temptation: number, instructiveness: number, degraded: boolean}>}
 */
export async function probeFindability({
  maiaClient, fen, bestMoveUci, playedMoveUci, winLossPts, maiaModel,
}) {
  let policyMap;
  let degraded = false;

  try {
    policyMap = await maiaClient.policy(fen);
  } catch (err) {
    log.warn({ err, fen, maiaModel }, 'Maia policy probe failed — degrading to binary findability');
    degraded = true;
  }

  if (!degraded && (!policyMap || policyMap.size === 0)) {
    log.warn({ fen, maiaModel }, 'empty policy map — degrading to binary findability');
    degraded = true;
  }

  let findability, temptation;

  if (degraded) {
    // Binary fallback: 1.0 if Maia agrees with Stockfish, 0.25 otherwise
    let maiaMove;
    try {
      maiaMove = await maiaClient.bestmove(fen);
    } catch {
      maiaMove = null;
    }
    findability = maiaMove === bestMoveUci ? 1.0 : 0.25;
    temptation = maiaMove === playedMoveUci ? 0.75 : 0.25;
  } else {
    findability = policyMap.get(bestMoveUci) ?? 0;
    temptation = policyMap.get(playedMoveUci) ?? 0;
  }

  const instructiveness = winLossPts * findability;

  return { findability, temptation, instructiveness, degraded };
}

/**
 * Select which Maia weight file to use based on the player's ELO.
 * @param {number} playerElo
 * @param {string[]} availableWeights — sorted list of available weight IDs e.g. ['maia-1100', ...]
 * @returns {string} e.g. 'maia-1300'
 */
export function nearestMaiaModel(playerElo, availableWeights) {
  const maias = availableWeights.filter(w => w.startsWith('maia-'));
  if (!maias.length) throw new Error('No Maia weights available');
  return maias.reduce((best, w) => {
    const eloW = parseInt(w.split('-')[1]);
    const eloBest = parseInt(best.split('-')[1]);
    return Math.abs(eloW - playerElo) < Math.abs(eloBest - playerElo) ? w : best;
  });
}
