/**
 * @module tests/support/journey/journey-dsl
 * High-level helpers for driving the journey harness through scripted scenarios.
 *
 * All helpers return Promises so they can be awaited in sequence.
 * Engine turns are handled synchronously inside `playGame` — the FakeEnginePool
 * returns immediately, and analysis is triggered by game_finished events.
 */

import { runBookMaintenance } from '../../../src/api/ws/maintenance-service.js';
import { getProvenanceId } from '../../../src/api/ws/repertoire-service.js';

import { advanceDays } from './harness.js';

const DEFAULT_OPPONENT = 'maia-1100';

// ─── Game scripting ──────────────────────────────────────────────────────────

/**
 * Play a complete scripted game.
 *
 * Sends new_game → move(s) → [resign or wait for game over] → waits for analysis.
 *
 * @param {import('./harness.js').JourneyHarness} harness
 * @param {object} opts
 * @param {Array<{uci: string, san: string, fen: string}>} opts.moves — player moves in order
 *   (engine replies are handled automatically by FakeEnginePool)
 * @param {string}  [opts.opponentId='maia-1100']
 * @param {string}  [opts.playerColor='white']
 * @param {boolean} [opts.ranked=true]
 * @param {boolean} [opts.coachEnabled=true]
 * @param {boolean} [opts.resign=false] — if true, player resigns after all moves
 * @param {object}  [opts.playerBand] — eval quality band for player moves
 * @param {object}  [opts.engineBand] — eval quality band for engine moves
 * @returns {Promise<{ws: FakeWs, gameId: string, moves: object[]}>}
 */
export async function playGame(harness, {
  moves = [],
  opponentId = DEFAULT_OPPONENT,
  playerColor = 'white',
  ranked = true,
  coachEnabled = true,
  resign = false,
} = {}) {
  const ws = harness.newWs();

  // Start game
  await harness.send(ws, {
    type: 'new_game',
    opponentId,
    color: playerColor,
    ranked,
    coachEnabled,
  });

  const startMsg = ws.lastOfType('game_started');
  if (!startMsg) throw new Error('playGame: expected game_started message');
  const gameId = startMsg.gameId;

  // Apply each player move, handling any book alerts
  const appliedMoves = [];
  for (const move of moves) {
    await harness.send(ws, { type: 'move', uci: move.uci });

    // Handle repertoire alerts: if a repertoire_alert arrives, auto-continue
    // If an alert is pending (pendingMoves), fire the alert timeout
    // which causes the handler to auto-apply the move after timeout
    if (ws.messagesOfType('repertoire_alert').length > 0 &&
        ws.lastOfType('repertoire_alert') &&
        !ws.lastOfType('move_accepted')) {
      // Timer fires → auto-continues
      harness.scheduler.fireAll();
    }

    appliedMoves.push({ uci: move.uci, san: move.san, fen: move.fen });
  }

  if (resign) {
    await harness.send(ws, { type: 'resign' });
  }

  // analyseGame is triggered by the game_finished event (wired in harness.newWs).
  // The FakeEnginePool resolves all engine calls as Promises that complete in
  // the microtask queue before the next macrotask. This setTimeout lets them settle.
  await new Promise(resolve => setTimeout(resolve, 10));

  return { ws, gameId, moves: appliedMoves };
}

// ─── Repertoire choice helpers ───────────────────────────────────────────────

/**
 * Accept a pending book alert (player keeps their move).
 * Call BEFORE the timeout if you want to test the explicit-keep path.
 */
export async function acceptAlert(harness, ws) {
  await harness.send(ws, { type: 'repertoire_choice', choice: 'keep' });
}

/**
 * Refuse a pending book alert (player takes back and plays the book move).
 * @param {string} bookMoveUci — the UCI move the coach suggests
 */
export async function refuseAlert(harness, ws, bookMoveUci) {
  await harness.send(ws, { type: 'repertoire_choice', choice: 'book', uci: bookMoveUci });
}

// ─── Day advance ─────────────────────────────────────────────────────────────

/**
 * Advance the simulation by gapDays days and run book maintenance.
 *
 * @param {import('./harness.js').JourneyHarness} harness
 * @param {number} [gapDays=1]
 * @param {object} [opts]
 * @param {Function} [opts.maintenance] — async function(harness) to run maintenance;
 *   defaults to a stub that records the gap (Phase 28: no maintenance service yet)
 */
export async function advanceDay(harness, gapDays = 1, { maintenance } = {}) {
  advanceDays(harness, gapDays);

  if (maintenance) {
    await maintenance(harness);
    return;
  }

  // Phase 29: run book maintenance on every day advance
  const nowMs = harness.clock.now().getTime();
  const provenanceId = getProvenanceId(harness.repertoireRepo);
  const bookVersion = harness.repertoireRepo.getCurrentBookVersion();
  await runBookMaintenance({ repertoireRepo: harness.repertoireRepo, nowMs, provenanceId, bookVersion, enginePool: harness.enginePool });
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

/**
 * Snapshot the current state of the book for assertion.
 * @param {import('./harness.js').JourneyHarness} harness
 * @returns {object} snapshot
 */
export function snapshotBook(harness) {
  const nodes      = harness.repertoireRepo.listNodes();
  const changelog  = harness.repertoireRepo.getChangelog(200);
  const bookVersion = harness.repertoireRepo.getCurrentBookVersion();

  const candidates = nodes.filter(n => {
    const moves = harness.repertoireRepo.getMovesForNode(n.epd, n.side);
    return moves.some(m => m.role === 'candidate');
  });
  const confirmed = nodes.filter(n => {
    const moves = harness.repertoireRepo.getMovesForNode(n.epd, n.side);
    return moves.some(m => m.role === 'canonical' || m.role === 'alt');
  });

  return {
    bookVersion,
    totalNodes: nodes.length,
    candidateNodes: candidates.length,
    confirmedNodes: confirmed.length,
    changelogEntries: changelog.length,
  };
}
