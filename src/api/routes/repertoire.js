/**
 * @module api/routes/repertoire
 * REST endpoints for the repertoire system.
 */

import { randomUUID } from 'crypto';

import { Router } from 'express';

import { REP_REVERSAL_SUPPRESS_ENCOUNTERS } from '../../shared/balance.js';
import { logger } from '../../config.js';

const log = logger.child({ mod: 'repertoire-routes' });

/**
 * @param {{ repertoireRepo: object }} opts
 * @returns {Router}
 */
export function makeRepertoireRouter({ repertoireRepo }) {
  const r = Router();

  /** GET /api/repertoire/tree — all nodes with their moves */
  r.get('/tree', (req, res) => {
    try {
      const nodes = repertoireRepo.listNodes();
      const result = nodes.map(node => ({
        ...node,
        moves: repertoireRepo.getMovesForNode(node.epd, node.side),
      }));
      res.json({ nodes: result });
    } catch (err) {
      log.error({ err }, 'GET /tree failed');
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  /** GET /api/repertoire/coverage — book coverage statistics */
  r.get('/coverage', (req, res) => {
    try {
      const nodes = repertoireRepo.listNodes();
      let coveredNodes = 0;
      let candidateCount = 0;
      let canonicalCount = 0;

      for (const node of nodes) {
        const moves = repertoireRepo.getMovesForNode(node.epd, node.side);
        if (moves.some(m => m.role === 'canonical')) coveredNodes++;
        for (const m of moves) {
          if (m.role === 'candidate') candidateCount++;
          if (m.role === 'canonical') canonicalCount++;
        }
      }

      res.json({
        totalNodes: nodes.length,
        coveredNodes,
        candidateCount,
        canonicalCount,
        coveragePct: nodes.length > 0 ? Math.round((coveredNodes / nodes.length) * 100) : 0,
      });
    } catch (err) {
      log.error({ err }, 'GET /coverage failed');
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  /** GET /api/repertoire/challenges — open challenges */
  r.get('/challenges', (req, res) => {
    try {
      const challenges = repertoireRepo.listOpenChallenges();
      res.json({ challenges });
    } catch (err) {
      log.error({ err }, 'GET /challenges failed');
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  /** GET /api/repertoire/refusals — deviation log (alerted deviations) */
  r.get('/refusals', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit ?? '200', 10), 500);
      const deviations = repertoireRepo.getAllDeviations(limit);
      const refusals = deviations.filter(d =>
        d.resolution === 'alerted_kept' ||
        d.resolution === 'alerted_corrected' ||
        d.resolution === 'alerted_timeout'
      );
      res.json({ refusals });
    } catch (err) {
      log.error({ err }, 'GET /refusals failed');
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  /** GET /api/repertoire/changelog — recent changelog feed */
  r.get('/changelog', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
      const entries = repertoireRepo.getChangelog(limit);
      res.json({ entries });
    } catch (err) {
      log.error({ err }, 'GET /changelog failed');
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  /** POST /api/repertoire/changelog/:id/reverse — reverse a promotion */
  r.post('/changelog/:id/reverse', (req, res) => {
    try {
      const entry = repertoireRepo.getChangelogEntry(req.params.id);
      if (!entry) {
        return res.status(404).json({ error: 'not_found', message: 'Changelog entry not found' });
      }
      if (entry.kind !== 'promote' && entry.kind !== 'settle') {
        return res.status(409).json({ error: 'not_reversible', message: 'Only promote/settle entries can be reversed' });
      }

      const provenanceId = repertoireRepo.getOrCreateProvenance({
        schemaVersion: '22', balanceHash: 'live', appGitSha: null,
        sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null,
      });

      repertoireRepo.transaction(() => {
        const newBookVersion = repertoireRepo.incrementBookVersion();
        const now = Date.now();

        if (entry.kind === 'promote') {
          // Restore: promoted challenger → retired, demoted incumbent → canonical
          const challengerMove = repertoireRepo.getMove(entry.epd, entry.side, entry.toUci);
          if (challengerMove) {
            repertoireRepo.upsertMove({ ...challengerMove, role: 'retired' });
          }
          const incumbentMove = repertoireRepo.getMove(entry.epd, entry.side, entry.fromUci);
          if (incumbentMove) {
            repertoireRepo.upsertMove({ ...incumbentMove, role: 'canonical' });
          }

          // Close the originating challenge as user_override
          if (entry.challengeId) {
            const challenge = repertoireRepo.getChallenge(entry.challengeId);
            if (challenge && (challenge.status === 'open' || challenge.status === 'promoted')) {
              repertoireRepo.updateChallenge(entry.challengeId, {
                status: 'rejected',
                resolutionRule: 'user_override',
                resolvedAt: now,
                resolvedBy: 'user_override',
              });
            }
          }

          // Suppress the challenger so the next learning pass cannot re-promote it
          const node = repertoireRepo.getNode(entry.epd, entry.side);
          const changelogId = randomUUID();

          repertoireRepo.upsertSuppression({
            epd: entry.epd,
            side: entry.side,
            moveUci: entry.toUci,
            untilEncounters: (node?.encounters ?? 0) + REP_REVERSAL_SUPPRESS_ENCOUNTERS,
            createdAt: now,
            changelogId,
          });

          repertoireRepo.appendChangelog({
            id: changelogId,
            at: now,
            epd: entry.epd,
            side: entry.side,
            kind: 'reverse',
            fromUci: entry.toUci,
            toUci: entry.fromUci,
            challengeId: entry.challengeId,
            rule: null,
            detailJson: JSON.stringify({ reversedEntryId: entry.id }),
            provenanceId,
            bookVersion: newBookVersion,
          });
        }
        // settle reversal: restore challenger to challenger role (not alt)
        if (entry.kind === 'settle') {
          const challengerMove = entry.challengeId
            ? (() => { const c = repertoireRepo.getChallenge(entry.challengeId); return c ? repertoireRepo.getMove(c.epd, c.side, c.challengerUci) : null; })()
            : null;
          if (challengerMove) {
            repertoireRepo.upsertMove({ ...challengerMove, role: 'challenger' });
          }
          const changelogId = randomUUID();
          const node = repertoireRepo.getNode(entry.epd, entry.side);
          repertoireRepo.upsertSuppression({
            epd: entry.epd,
            side: entry.side,
            moveUci: challengerMove?.moveUci ?? '',
            untilEncounters: (node?.encounters ?? 0) + REP_REVERSAL_SUPPRESS_ENCOUNTERS,
            createdAt: now,
            changelogId,
          });
          repertoireRepo.appendChangelog({
            id: changelogId,
            at: now,
            epd: entry.epd,
            side: entry.side,
            kind: 'reverse',
            fromUci: null,
            toUci: null,
            challengeId: entry.challengeId,
            rule: null,
            detailJson: JSON.stringify({ reversedEntryId: entry.id }),
            provenanceId,
            bookVersion: newBookVersion,
          });
        }
      });

      res.json({ ok: true });
    } catch (err) {
      log.error({ err, id: req.params.id }, 'POST /changelog/:id/reverse failed');
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  return r;
}
