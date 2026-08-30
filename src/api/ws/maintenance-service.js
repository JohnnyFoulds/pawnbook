/**
 * @module api/ws/maintenance-service
 * Periodic book maintenance: canonical election, candidate expiry, quarantine re-audit.
 *
 * Called once per `advanceDay` in the journey harness and on server startup.
 * All writes go through a single transaction per node to preserve invariant 3.
 * Errors are always swallowed — maintenance failure must never affect a game.
 */

import { randomUUID } from 'crypto';

import { electCanonical } from '../../domain/repertoire/vote.js';
import { candidateExpired, reAuditQuarantined } from '../../domain/repertoire/state.js';
import { REP_CANDIDATE_TTL_ENCOUNTERS } from '../../shared/balance.js';
import { logger } from '../../config.js';

const log = logger.child({ mod: 'maintenance-service' });

/**
 * Run one maintenance pass on the book.
 * Always resolves (never rejects).
 *
 * @param {object} opts
 * @param {object} opts.repertoireRepo
 * @param {number} opts.nowMs
 * @param {number} opts.provenanceId
 * @param {number} opts.bookVersion
 * @returns {Promise<{ elections: number, expirations: number, reaudits: number }>}
 */
export async function runBookMaintenance({ repertoireRepo, nowMs, provenanceId, bookVersion }) {
  const counts = { elections: 0, expirations: 0, reaudits: 0 };
  try {
    counts.elections  = _runCanonicalElection({ repertoireRepo, nowMs, provenanceId, bookVersion });
    counts.expirations = _runCandidateExpiry({ repertoireRepo, nowMs, provenanceId, bookVersion });
    counts.reaudits   = _runQuarantineReaudit({ repertoireRepo, nowMs, provenanceId, bookVersion });
    log.debug(counts, 'book maintenance complete');
  } catch (err) {
    log.warn({ err }, 'book maintenance failed — swallowed');
  }
  return counts;
}

// ─── Canonical election ───────────────────────────────────────────────────────

/**
 * For every node, call electCanonical over all non-candidate, non-refused, non-retired moves.
 * Writes a 'promote'/'demote' changelog entry when the elected canonical changes.
 *
 * @returns {number} number of nodes where the canonical changed
 */
function _runCanonicalElection({ repertoireRepo, nowMs, provenanceId, bookVersion }) {
  const nodes = repertoireRepo.listNodes();
  let changed = 0;

  for (const node of nodes) {
    const moves = repertoireRepo.getMovesForNode(node.epd, node.side);
    const eligible = moves.filter(m =>
      m.role === 'canonical' || m.role === 'alt' || m.role === 'challenger'
    );
    if (!eligible.length) continue;

    // Build the observation input electCanonical expects
    const observations = repertoireRepo.getObservationsForNode(node.epd, node.side);
    const eligibleInput = eligible.map(m => {
      const ownObs = observations
        .filter(o => o.moveUci === m.moveUci && o.source !== 'coach_corrected')
        .map(o => ({ playedAt: o.playedAt }));
      return {
        uci: m.moveUci,
        observations: ownObs,
        meanWinLossPts: m.meanWinLossPts ?? 0,
        score: (m.scoreW ?? 0) + (m.scoreD ?? 0) * 0.5,
      };
    });

    const { canonical: electedUci, alts: electedAlts } = electCanonical(eligibleInput, nowMs);
    if (!electedUci) continue;

    const currentCanonical = eligible.find(m => m.role === 'canonical')?.moveUci ?? null;
    const currentAlts = new Set(eligible.filter(m => m.role === 'alt').map(m => m.moveUci));
    const newAlts = new Set(electedAlts);

    const needsUpdate = electedUci !== currentCanonical ||
      electedAlts.some(u => !currentAlts.has(u)) ||
      [...currentAlts].some(u => !newAlts.has(u));

    if (!needsUpdate) continue;

    const moveUpdates = eligible.map(m => {
      let newRole;
      if (m.moveUci === electedUci) {
        newRole = 'canonical';
      } else if (newAlts.has(m.moveUci)) {
        newRole = 'alt';
      } else {
        // Previously canonical/alt/challenger but no longer elected — becomes alt or stays challenger
        newRole = m.role === 'challenger' ? 'challenger' : 'alt';
      }
      return { ...m, role: newRole };
    });

    const entry = {
      id: randomUUID(),
      at: nowMs,
      epd: node.epd,
      side: node.side,
      kind: 'elect',
      fromUci: currentCanonical,
      toUci: electedUci,
      challengeId: null,
      rule: 'recency_vote',
      detailJson: JSON.stringify({ electedAlts }),
      provenanceId,
      bookVersion,
    };

    repertoireRepo.transaction(() => {
      for (const m of moveUpdates) repertoireRepo.upsertMove(m);
      if (electedUci !== currentCanonical) {
        repertoireRepo.appendChangelog(entry);
        repertoireRepo.incrementBookVersion();
      }
    });

    if (electedUci !== currentCanonical) changed++;
  }

  return changed;
}

// ─── Candidate expiry ─────────────────────────────────────────────────────────

/**
 * Expire candidates that have reached REP_CANDIDATE_TTL_ENCOUNTERS without confirming.
 * Writes a 'retire' changelog entry for each expiration.
 *
 * @returns {number} number of candidates expired
 */
function _runCandidateExpiry({ repertoireRepo, nowMs, provenanceId, bookVersion }) {
  const nodes = repertoireRepo.listNodes();
  let expired = 0;

  for (const node of nodes) {
    const moves = repertoireRepo.getMovesForNode(node.epd, node.side);
    const candidates = moves.filter(m => m.role === 'candidate');
    if (!candidates.length) continue;

    for (const cand of candidates) {
      if (!candidateExpired(node.encounters, REP_CANDIDATE_TTL_ENCOUNTERS)) continue;

      const updated = { ...cand, role: 'retired' };
      const entry = {
        id: randomUUID(),
        at: nowMs,
        epd: node.epd,
        side: node.side,
        kind: 'retire',
        fromUci: cand.moveUci,
        toUci: null,
        challengeId: null,
        rule: 'candidate_ttl',
        detailJson: JSON.stringify({ encounters: node.encounters, ttl: REP_CANDIDATE_TTL_ENCOUNTERS }),
        provenanceId,
        bookVersion,
      };

      repertoireRepo.transaction(() => {
        repertoireRepo.upsertMove(updated);
        repertoireRepo.appendChangelog(entry);
        repertoireRepo.incrementBookVersion();
      });
      expired++;
    }
  }

  return expired;
}

// ─── Quarantine re-audit ──────────────────────────────────────────────────────

/**
 * Re-audit quarantined moves using their latest game eval.
 * Moves that now pass the gate are promoted to 'alt'.
 * Moves that are now blunders are demoted to 'refused'.
 *
 * @returns {number} number of quarantined moves whose role changed
 */
function _runQuarantineReaudit({ repertoireRepo, nowMs, provenanceId, bookVersion }) {
  const nodes = repertoireRepo.listNodes();
  let changed = 0;

  for (const node of nodes) {
    const moves = repertoireRepo.getMovesForNode(node.epd, node.side);
    const quarantined = moves.filter(m => m.role === 'quarantined');
    if (!quarantined.length) continue;

    for (const q of quarantined) {
      const newRole = reAuditQuarantined({ winLossPts: q.meanWinLossPts ?? 0 });
      if (newRole === 'quarantined') continue;

      const updated = { ...q, role: newRole };
      const entry = {
        id: randomUUID(),
        at: nowMs,
        epd: node.epd,
        side: node.side,
        kind: newRole === 'alt' ? 'quarantine_exit' : 'refuse',
        fromUci: q.moveUci,
        toUci: q.moveUci,
        challengeId: null,
        rule: 're_audit',
        detailJson: JSON.stringify({ meanWinLossPts: q.meanWinLossPts, newRole }),
        provenanceId,
        bookVersion,
      };

      repertoireRepo.transaction(() => {
        repertoireRepo.upsertMove(updated);
        repertoireRepo.appendChangelog(entry);
        repertoireRepo.incrementBookVersion();
      });
      changed++;
    }
  }

  return changed;
}
