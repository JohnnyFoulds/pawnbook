/**
 * @module api/ws/challenge-service
 * Resolves open challenges after each game's book update.
 * Pure rules from domain/repertoire/challenge.js; this module only does I/O.
 * Always swallows errors — repertoire failures must never affect a game or analysis run.
 */

import { randomUUID } from 'crypto';

import { resolveChallenge } from '../../domain/repertoire/challenge.js';
import {
  REP_REVERSAL_SUPPRESS_ENCOUNTERS,
  REP_ALT_ALTERNATION_MIN,
  REP_RECENCY_HALFLIFE_DAYS,
} from '../../shared/balance.js';
import { logger } from '../../config.js';

const log = logger.child({ mod: 'challenge-service' });

/**
 * Run challenge resolution on all open challenges.
 * Called after each game's rep_observations are written.
 * Always resolves — errors logged and swallowed.
 *
 * @param {{ repertoireRepo: object, bookVersion: number, provenanceId: number, nowMs?: number }} opts
 */
export async function resolveOpenChallenges({ repertoireRepo, bookVersion, provenanceId, nowMs = Date.now() }) {
  try {
    const challenges = repertoireRepo.listOpenChallenges();
    for (const challenge of challenges) {
      _resolveOne(challenge, repertoireRepo, bookVersion, provenanceId, nowMs);
    }
  } catch (err) {
    log.warn({ err }, 'challenge resolution failed');
  }
}

function _resolveOne(challenge, repo, bookVersion, provenanceId, nowMs = Date.now()) {
  try {
    const evidence = _gatherEvidence(challenge, repo, nowMs);
    const { status, rule } = resolveChallenge(evidence);

    // Always update the running counters so the data is current
    repo.updateChallenge(challenge.id, {
      challengerPlays: evidence.challengerPlays,
      incumbentPlays: evidence.incumbentPlays,
      encountersSinceOpen: evidence.encountersSinceOpen,
    });

    if (status === 'open') return;

    // Resolved — write all state changes atomically
    repo.transaction(() => {
      const now = nowMs;
      const newBookVersion = repo.incrementBookVersion();

      repo.updateChallenge(challenge.id, {
        status,
        resolutionRule: rule,
        resolvedAt: now,
        resolvedBy: 'algorithm',
        challengerPlays: evidence.challengerPlays,
        incumbentPlays: evidence.incumbentPlays,
        encountersSinceOpen: evidence.encountersSinceOpen,
      });

      if (status === 'promoted') {
        const challengerMove = repo.getMove(challenge.epd, challenge.side, challenge.challengerUci);
        if (challengerMove) {
          repo.upsertMove({ ...challengerMove, role: 'canonical' });
        }
        const incumbentMove = repo.getMove(challenge.epd, challenge.side, challenge.incumbentUci);
        if (incumbentMove) {
          repo.upsertMove({ ...incumbentMove, role: 'retired' });
        }

        const changelogId = randomUUID();
        const node = repo.getNode(challenge.epd, challenge.side);
        const untilEncounters = (node?.encounters ?? 0) + REP_REVERSAL_SUPPRESS_ENCOUNTERS;

        // Suppress the retired incumbent to prevent immediate re-promotion
        repo.upsertSuppression({
          epd: challenge.epd,
          side: challenge.side,
          moveUci: challenge.incumbentUci,
          untilEncounters,
          createdAt: now,
          changelogId,
        });

        repo.appendChangelog({
          id: changelogId,
          at: now,
          epd: challenge.epd,
          side: challenge.side,
          kind: 'promote',
          fromUci: challenge.incumbentUci,
          toUci: challenge.challengerUci,
          challengeId: challenge.id,
          rule,
          detailJson: JSON.stringify({
            challengerPlays: evidence.challengerPlays,
            incumbentPlays: evidence.incumbentPlays,
            engineDelta: evidence.engineDelta,
          }),
          provenanceId,
          bookVersion: newBookVersion,
        });

      } else if (status === 'settled_both') {
        // Incumbent stays canonical; challenger becomes alt
        const challengerMove = repo.getMove(challenge.epd, challenge.side, challenge.challengerUci);
        if (challengerMove) {
          repo.upsertMove({ ...challengerMove, role: 'alt' });
        }
        repo.appendChangelog({
          id: randomUUID(),
          at: now,
          epd: challenge.epd,
          side: challenge.side,
          kind: 'settle',
          fromUci: null,
          toUci: null,
          challengeId: challenge.id,
          rule,
          detailJson: JSON.stringify({ challengerPlays: evidence.challengerPlays }),
          provenanceId,
          bookVersion: newBookVersion,
        });
      }
      // rejected / rejected_unsound / abandoned: no book change, no changelog entry
    });

    log.info({ challengeId: challenge.id, status, rule }, 'challenge resolved');
  } catch (err) {
    log.warn({ err, challengeId: challenge.id }, 'single challenge resolution failed');
  }
}

function _gatherEvidence(challenge, repo, nowMs = Date.now()) {
  const observations = repo.getObservationsForNode(challenge.epd, challenge.side);
  const openedAt = challenge.openedAt;

  // Only count self-directed plays (source != 'coach_corrected') after the challenge opened
  const afterOpen = observations.filter(
    o => o.playedAt >= openedAt && o.source !== 'coach_corrected'
  );
  const challengerPlays = afterOpen.filter(o => o.moveUci === challenge.challengerUci).length;
  const incumbentPlays = afterOpen.filter(o => o.moveUci === challenge.incumbentUci).length;
  const encountersSinceOpen = afterOpen.length;

  // All self-directed challenger observations (including pre-challenge)
  const challengerObservations = observations.filter(
    o => o.moveUci === challenge.challengerUci && o.source !== 'coach_corrected'
  ).length;

  // Suppression check — suppression fires when node encounters < threshold
  const supp = repo.getSuppression(challenge.epd, challenge.side, challenge.challengerUci);
  const node = repo.getNode(challenge.epd, challenge.side);
  const isSuppressed = supp != null && (node?.encounters ?? 0) < supp.untilEncounters;

  const halfLifeMs = REP_RECENCY_HALFLIFE_DAYS * 86_400_000;
  const incumbentRecentCount = observations.filter(
    o => o.moveUci === challenge.incumbentUci &&
         o.source !== 'coach_corrected' &&
         (nowMs - (o.playedAt ?? 0)) <= halfLifeMs
  ).length;
  const challengerRecentCount = observations.filter(
    o => o.moveUci === challenge.challengerUci &&
         o.source !== 'coach_corrected' &&
         (nowMs - (o.playedAt ?? 0)) <= halfLifeMs
  ).length;
  const qualifiesForAlternation = incumbentRecentCount >= REP_ALT_ALTERNATION_MIN &&
                                   challengerRecentCount >= REP_ALT_ALTERNATION_MIN;

  return {
    challengerPlays,
    incumbentPlays,
    encountersSinceOpen,
    challengerObservations,
    engineDelta: challenge.engineDeltaWinPts ?? null,
    gateVerdict: null, // Phase 26: depth-22 A/B audit
    trendChallenger: challenge.trendChallenger ?? null,
    trendIncumbent: challenge.trendIncumbent ?? null,
    resultChallengerPerf: challenge.resultChallengerPerf ?? null,
    resultChallengerN: challenge.resultChallengerN ?? 0,
    resultIncumbentPerf: challenge.resultIncumbentPerf ?? null,
    resultIncumbentN: challenge.resultIncumbentN ?? 0,
    isSuppressed,
    qualifiesForAlternation,
  };
}
