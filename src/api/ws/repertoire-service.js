/**
 * @module api/ws/repertoire-service
 * Thin application service: loads existing book state, calls processGame, persists results.
 * Errors are always swallowed — repertoire failures must never affect a game or analysis.
 */

import { randomUUID, createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { processGame } from '../../domain/repertoire/build.js';
import { logger } from '../../config.js';

import { resolveOpenChallenges } from './challenge-service.js';

const log = logger.child({ mod: 'repertoire-service' });

const __dir = dirname(fileURLToPath(import.meta.url));
let _balanceHash;
function _getBalanceHash() {
  if (!_balanceHash) {
    try {
      const content = readFileSync(join(__dir, '../../shared/balance.js'));
      _balanceHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    } catch { _balanceHash = 'unknown'; }
  }
  return _balanceHash;
}

const SCHEMA_VERSION = '19';

/**
 * Get or create a provenance record for the current code version.
 * @param {object} repertoireRepo
 * @returns {number} provenance id
 */
export function getProvenanceId(repertoireRepo) {
  return repertoireRepo.getOrCreateProvenance({
    schemaVersion: SCHEMA_VERSION,
    balanceHash: _getBalanceHash(),
    appGitSha: null,
    sfVersion: null,
    sfDepth: null,
    sfMultipv: null,
    maiaWeightsId: null,
  });
}

/**
 * Update the repertoire book after a game is analysed.
 * Always resolves (never rejects) — errors are logged and swallowed.
 *
 * @param {object} opts
 * @param {string} opts.gameId
 * @param {string} opts.playerColor
 * @param {string|null} opts.gameResult
 * @param {object} opts.gameRepo
 * @param {object} opts.repertoireRepo
 * @param {object} [opts.puzzleRepo]
 * @param {import('ws').WebSocket} [opts.ws]
 * @param {import('../../ports/clock.js').Clock} [opts.clock] — injected clock; defaults to wall time
 */
export async function updateRepertoire({ gameId, playerColor, gameResult, gameRepo, repertoireRepo, puzzleRepo, ws, clock = null }) {
  try {
    const gameMoves = gameRepo.getMoves(gameId);
    if (!gameMoves.length) return;
    const moveEvals = gameRepo.getEvals(gameId);
    if (!moveEvals.length) return;

    const provenanceId = repertoireRepo.getOrCreateProvenance({
      schemaVersion: SCHEMA_VERSION,
      balanceHash: _getBalanceHash(),
      appGitSha: null,
      sfVersion: null,
      sfDepth: null,
      sfMultipv: null,
      maiaWeightsId: null,
    });

    const bookVersion = repertoireRepo.getCurrentBookVersion();
    const nowMs = clock ? clock.now().getTime() : Date.now();

    // Collect unique EPD+side keys for positions in this game (player moves only)
    const playerEvals = moveEvals.filter(e => e.mover === 'player');
    const epdKeys = [...new Set(playerEvals.map(e => {
      const parts = e.fen.split(' ');
      const side = parts[1] === 'b' ? 'black' : 'white';
      return parts.slice(0, 4).join(' ') + ':' + side;
    }))];

    const existingNodes = epdKeys.map(key => {
      const colon = key.lastIndexOf(':');
      return repertoireRepo.getNode(key.slice(0, colon), key.slice(colon + 1));
    }).filter(Boolean);

    const existingMoves = epdKeys.flatMap(key => {
      const colon = key.lastIndexOf(':');
      return repertoireRepo.getMovesForNode(key.slice(0, colon), key.slice(colon + 1));
    });

    const { observations, nodeUpserts, moveUpserts, changelogEntries } = processGame({
      gameId,
      playerColor,
      gameResult,
      gameMoves,
      moveEvals,
      existingNodes,
      existingMoves,
      provenanceId,
      bookVersion,
      source: 'game',
      nowMs,
    });

    repertoireRepo.transaction(() => {
      for (const obs of observations) repertoireRepo.appendObservation(obs);
      for (const node of nodeUpserts) repertoireRepo.upsertNode(node);
      for (const move of moveUpserts) repertoireRepo.upsertMove(move);
      for (const entry of changelogEntries) {
        repertoireRepo.appendChangelog({ id: randomUUID(), ...entry });
      }
      if (changelogEntries.length > 0) repertoireRepo.incrementBookVersion();
    });

    // Resolve any open challenges with the freshly-written observations
    await resolveOpenChallenges({ repertoireRepo, bookVersion, provenanceId, nowMs });

    // Create/update opening FSRS cards for all confirmed canonical nodes
    if (puzzleRepo) {
      _ensureOpeningCards(repertoireRepo, puzzleRepo, nowMs);
    }

    if (ws?.readyState === 1) {
      const confirmedCount = changelogEntries.filter(e => e.kind === 'confirm').length;
      ws.send(JSON.stringify({
        type: 'repertoire_update',
        gameId,
        newObservations: observations.length,
        confirmedCount,
        bookVersion: repertoireRepo.getCurrentBookVersion(),
      }));
    }

    log.info({ gameId, observations: observations.length, confirmed: changelogEntries.length }, 'repertoire updated');
  } catch (err) {
    log.warn({ err, gameId }, 'repertoire update failed — swallowed');
  }
}

/**
 * Create or update opening FSRS cards for every canonical node in the book.
 * Idempotent: safe to call after every game.
 * Accepted moves = canonical + alt + challenger (NOT quarantined — invariant 2).
 *
 * @param {object} repertoireRepo
 * @param {object} puzzleRepo
 * @param {number} [nowMs] — current timestamp; defaults to Date.now()
 */
export function _ensureOpeningCards(repertoireRepo, puzzleRepo, nowMs = Date.now()) {
  const nodes = repertoireRepo.listNodes();
  const tomorrow = nowMs + 24 * 60 * 60 * 1000;

  for (const node of nodes) {
    const moves = repertoireRepo.getMovesForNode(node.epd, node.side);
    const canonicalMove = moves.find(m => m.role === 'canonical');
    if (!canonicalMove) continue;

    const acceptedUcis = [...new Set(
      moves
        .filter(m => m.role === 'canonical' || m.role === 'alt' || m.role === 'challenger')
        .map(m => m.moveUci)
    )];
    const acceptedMovesJson = JSON.stringify(acceptedUcis);

    const fen = node.fen;
    const existing = puzzleRepo.getByFenAndKind?.(fen, 'opening');
    if (existing) {
      puzzleRepo.updateAcceptedMoves?.(existing.id, acceptedMovesJson);
      continue;
    }

    const puzzleId = puzzleRepo.save({
      kind: 'opening',
      fen,
      sideToMove: node.side,
      bestMoveUci: canonicalMove.moveUci,
      bestMoveSan: canonicalMove.moveSan,
      pv: null,
      acceptedMovesJson,
      followupUci: null,
      playedMoveUci: null,
      playedMoveSan: null,
      cpLoss: null,
      winLossPts: null,
      classification: null,
      findability: null,
      temptation: null,
      instructiveness: null,
      tags: 'opening',
      maiaModel: null,
      policyTemperature: null,
      eloAtCreation: null,
      sourceGameId: null,
      sourcePly: null,
      phase: 'opening',
      wasTimed: 0,
    });

    if (!puzzleRepo.getCard(puzzleId)) {
      puzzleRepo.saveCard({
        puzzleId,
        due: tomorrow,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReview: null,
        graduated: 0,
      });
    }
  }
}
