/**
 * @module domain/game/roster
 * Static opponent roster. The table is the source of truth for all opponent metadata.
 */

import { existsSync } from 'fs';

import { ENGINE_PATHS, WEIGHTS_DIR, logger } from '../../config.js';

const log = logger.child({ mod: 'roster' });

/** @type {Array<{id: string, name: string, elo: number|null, optional?: boolean, type: string, description: string}>} */
const ROSTER_TABLE = [
  { id: 'maia-1100', name: 'Maia 1100', elo: 1100, type: 'maia3', description: 'Plays like a real 1100 — including the mistakes' },
  { id: 'maia-1200', name: 'Maia 1200', elo: 1200, type: 'maia3', description: 'Plays like a real 1200 — including the mistakes' },
  { id: 'maia-1300', name: 'Maia 1300', elo: 1300, type: 'maia3', description: 'Plays like a real 1300 — including the mistakes' },
  { id: 'maia-1400', name: 'Maia 1400', elo: 1400, type: 'maia3', description: 'Plays like a real 1400 — including the mistakes' },
  { id: 'maia-1500', name: 'Maia 1500', elo: 1500, type: 'maia3', description: 'Plays like a real 1500 — including the mistakes' },
  { id: 'maia-1600', name: 'Maia 1600', elo: 1600, type: 'maia3', description: 'Plays like a real 1600 — including the mistakes' },
  { id: 'maia-1700', name: 'Maia 1700', elo: 1700, type: 'maia3', description: 'Plays like a real 1700 — including the mistakes' },
  { id: 'maia-1800', name: 'Maia 1800', elo: 1800, type: 'maia3', description: 'Plays like a real 1800 — including the mistakes' },
  { id: 'maia-1900', name: 'Maia 1900', elo: 1900, type: 'maia3', description: 'Plays like a real 1900 — including the mistakes' },
  { id: 'maia-2000', name: 'Maia 2000', elo: 2000, type: 'maia3', description: 'Plays like a real 2000 — including the mistakes' },
  { id: 'maia-2200', name: 'Maia 2200', elo: 2200, type: 'maia3', description: 'Near-master human patterns' },
  { id: 'sf-1400',   name: 'Stockfish 1400', elo: 1400, type: 'stockfish', description: 'Engine-shaped play at 1400' },
  { id: 'sf-1700',   name: 'Stockfish 1700', elo: 1700, type: 'stockfish', description: 'Engine-shaped play at 1700' },
  { id: 'sf-2000',   name: 'Stockfish 2000', elo: 2000, type: 'stockfish', description: 'Engine-shaped play at 2000' },
  { id: 'sf-2300',   name: 'Stockfish 2300', elo: 2300, type: 'stockfish', description: 'Engine-shaped play at 2300' },
  { id: 'sf-2600',   name: 'Stockfish 2600', elo: 2600, type: 'stockfish', description: 'Engine-shaped play at 2600' },
  { id: 'sf-2900',   name: 'Stockfish 2900', elo: 2900, type: 'stockfish', description: 'Engine-shaped play at 2900' },
  { id: 'sf-max',    name: 'Stockfish Max', elo: 3190, type: 'stockfish', description: 'Full-strength Stockfish — no limit' },
  { id: 'drawfish',  name: 'Drawfish', elo: null, type: 'drawfish', description: 'Plays for stalemate — unrated novelty' },
];

/** @returns {object[]} verified available opponents */
export function getAvailableOpponents() {
  // Cache the maia3 binary check — all maia3 entries share one binary.
  let maia3Checked = false;
  let maia3Available = false;

  return ROSTER_TABLE.filter(opp => {
    if (opp.type === 'maia3') {
      if (!maia3Checked) {
        maia3Available = ENGINE_PATHS.maia3 != null && existsSync(ENGINE_PATHS.maia3);
        if (!maia3Available) {
          log.warn({ binary: ENGINE_PATHS.maia3 }, 'Maia 3 binary missing — maia3 opponents excluded');
        }
        maia3Checked = true;
      }
      return maia3Available;
    }
    return true;
  });
}

/**
 * Return lc0/Maia-1 weight IDs whose .pb.gz files exist on disk.
 * Used by analysis-service to select a Maia policy probe for findability.
 * Independent of the game roster type — the lc0 weights remain on disk as
 * analysis assets even after maia3 replaced them for game play.
 * @returns {string[]} e.g. ['maia-1100', ..., 'maia-1900']
 */
export function getMaiaAnalysisWeights() {
  return [
    'maia-1100', 'maia-1200', 'maia-1300', 'maia-1400', 'maia-1500',
    'maia-1600', 'maia-1700', 'maia-1800', 'maia-1900',
  ].filter(id => existsSync(`${WEIGHTS_DIR}/${id}.pb.gz`));
}

/**
 * @param {string} id
 * @returns {object}
 * @throws if the opponent is not in the roster
 */
export function getOpponent(id) {
  const opp = ROSTER_TABLE.find(o => o.id === id);
  if (!opp) throw new Error(`Unknown opponent '${id}'`);
  return opp;
}

/** @returns {object[]} the full static table (for tests) */
export function getRosterTable() { return ROSTER_TABLE; }
