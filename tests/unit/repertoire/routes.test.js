/**
 * Unit tests for repertoire REST routes — smoke tests verifying correct responses.
 */

import { randomUUID } from 'crypto';

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

import { makeRepertoireRouter } from '../../../src/api/routes/repertoire.js';
import { InMemoryRepertoireRepository } from '../../../src/adapters/memory/repositories.js';

function makeApp(repo) {
  const app = express();
  app.use(express.json());
  app.use('/api/repertoire', makeRepertoireRouter({ repertoireRepo: repo }));
  return app;
}

const EPD = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3';

describe('GET /api/repertoire/tree', () => {
  it('returns empty nodes when book is empty', async () => {
    const repo = new InMemoryRepertoireRepository();
    const res = await request(makeApp(repo)).get('/api/repertoire/tree');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nodes: [] });
  });

  it('returns nodes with moves', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode({ epd: EPD, side: 'white', fen: EPD + ' 0 1', timesReached: 1, encounters: 1, firstSeen: 1_000, lastSeen: 1_000 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'd2d4', moveSan: 'd4', role: 'canonical', observations: 2, scoreW: 1, scoreD: 0, scoreL: 0 });
    const res = await request(makeApp(repo)).get('/api/repertoire/tree');
    expect(res.status).toBe(200);
    expect(res.body.nodes).toHaveLength(1);
    expect(res.body.nodes[0].moves).toHaveLength(1);
    expect(res.body.nodes[0].moves[0].role).toBe('canonical');
  });
});

describe('GET /api/repertoire/coverage', () => {
  it('returns zero stats when book is empty', async () => {
    const repo = new InMemoryRepertoireRepository();
    const res = await request(makeApp(repo)).get('/api/repertoire/coverage');
    expect(res.status).toBe(200);
    expect(res.body.totalNodes).toBe(0);
    expect(res.body.coveredNodes).toBe(0);
    expect(res.body.coveragePct).toBe(0);
    expect(res.body.canonicalCount).toBe(0);
  });

  it('counts covered nodes correctly', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode({ epd: EPD, side: 'white', fen: EPD + ' 0 1', timesReached: 2, encounters: 2, firstSeen: 1_000, lastSeen: 2_000 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'd2d4', moveSan: 'd4', role: 'canonical', observations: 3, scoreW: 1, scoreD: 0, scoreL: 0 });
    const res = await request(makeApp(repo)).get('/api/repertoire/coverage');
    expect(res.status).toBe(200);
    expect(res.body.totalNodes).toBe(1);
    expect(res.body.coveredNodes).toBe(1);
    expect(res.body.coveragePct).toBe(100);
  });

  it('returns 500 when repo throws', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.listNodes = () => { throw new Error('db down'); };
    const res = await request(makeApp(repo)).get('/api/repertoire/coverage');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

describe('GET /api/repertoire/gaps', () => {
  it('returns empty gaps when book is empty', async () => {
    const repo = new InMemoryRepertoireRepository();
    const res = await request(makeApp(repo)).get('/api/repertoire/gaps');
    expect(res.status).toBe(200);
    expect(res.body.gaps).toHaveLength(0);
  });

  it('returns gap candidates for uncovered opponent replies', async () => {
    const START_EPD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode({
      epd: START_EPD, side: 'white',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      timesReached: 5, encounters: 5, firstSeen: 1_000, lastSeen: 2_000,
      reachProb: 1.0,
    });
    repo.upsertMove({ epd: START_EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'canonical', observations: 5, scoreW: 1, scoreD: 0, scoreL: 0 });

    const res = await request(makeApp(repo)).get('/api/repertoire/gaps');
    expect(res.status).toBe(200);
    expect(res.body.gaps.length).toBeGreaterThan(0);
  });

  it('returns 500 when repo throws', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.listNodes = () => { throw new Error('db down'); };
    const res = await request(makeApp(repo)).get('/api/repertoire/gaps');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

describe('GET /api/repertoire/challenges', () => {
  it('returns empty when no open challenges', async () => {
    const repo = new InMemoryRepertoireRepository();
    const res = await request(makeApp(repo)).get('/api/repertoire/challenges');
    expect(res.status).toBe(200);
    expect(res.body.challenges).toHaveLength(0);
  });

  it('returns open challenges', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    repo.openChallenge({
      id: randomUUID(), epd: EPD, side: 'white', fen: EPD + ' 0 1',
      incumbentUci: 'd2d4', challengerUci: 'e2e4',
      openedGameId: 'g1', openedPly: 1, openedAt: 1_000,
      challengerPlays: 0, incumbentPlays: 0, encountersSinceOpen: 0,
      resultChallengerN: 0, resultIncumbentN: 0,
      status: 'open', provenanceId: provId, bookVersion: 0,
    });
    const res = await request(makeApp(repo)).get('/api/repertoire/challenges');
    expect(res.status).toBe(200);
    expect(res.body.challenges).toHaveLength(1);
  });

  it('returns 500 when repo throws', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.listOpenChallenges = () => { throw new Error('db down'); };
    const res = await request(makeApp(repo)).get('/api/repertoire/challenges');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

describe('GET /api/repertoire/refusals', () => {
  it('returns empty when no deviations', async () => {
    const repo = new InMemoryRepertoireRepository();
    const res = await request(makeApp(repo)).get('/api/repertoire/refusals');
    expect(res.status).toBe(200);
    expect(res.body.refusals).toHaveLength(0);
  });

  it('filters to alerted deviations only', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    // post_game deviation — should NOT appear
    repo.appendDeviation({ id: randomUUID(), gameId: 'g1', ply: 5, epd: EPD, kind: 'novelty', playedUci: 'e2e4', bookUci: 'd2d4', resolution: 'post_game', decisionMsTaken: null, provenanceId: provId, bookVersion: 0 });
    // alerted_kept — should appear
    repo.appendDeviation({ id: randomUUID(), gameId: 'g2', ply: 3, epd: EPD, kind: 'refused_repeat', playedUci: 'e2e4', bookUci: 'd2d4', resolution: 'alerted_kept', decisionMsTaken: 5000, provenanceId: provId, bookVersion: 0 });
    const res = await request(makeApp(repo)).get('/api/repertoire/refusals');
    expect(res.status).toBe(200);
    expect(res.body.refusals).toHaveLength(1);
    expect(res.body.refusals[0].resolution).toBe('alerted_kept');
  });

  it('includes keptCount, keptInBookCount and hitRatePct', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    // Add a node so sideByEpd resolves
    repo.upsertNode({ epd: EPD, side: 'white', fen: EPD + ' 0 1', firstSeen: 1, lastSeen: 1, timesReached: 1, encounters: 1, minPly: 1, reachProb: null, reachStale: false, lineLoss: null, voteFrozenUntilEncounter: null });
    // alerted_kept deviation for e2e4 — which is now canonical in book
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'canonical', observations: 2, weightedScore: 1, meanWinLossPts: 0, worstWinLossPts: 0, auditId: null, gateReason: null, scoreW: 1, scoreD: 0, scoreL: 0, firstPlayed: 1, lastPlayed: 1 });
    repo.appendDeviation({ id: randomUUID(), gameId: 'g1', ply: 3, epd: EPD, kind: 'refused_repeat', playedUci: 'e2e4', bookUci: 'd2d4', resolution: 'alerted_kept', decisionMsTaken: 3000, provenanceId: provId, bookVersion: 0 });
    const res = await request(makeApp(repo)).get('/api/repertoire/refusals');
    expect(res.status).toBe(200);
    expect(res.body.keptCount).toBe(1);
    expect(res.body.keptInBookCount).toBe(1);
    expect(res.body.hitRatePct).toBe(100);
  });

  it('hitRatePct is null when no kept deviations', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    repo.appendDeviation({ id: randomUUID(), gameId: 'g1', ply: 5, epd: EPD, kind: 'lapse', playedUci: 'e2e4', bookUci: 'd2d4', resolution: 'alerted_corrected', decisionMsTaken: 5000, provenanceId: provId, bookVersion: 0 });
    const res = await request(makeApp(repo)).get('/api/repertoire/refusals');
    expect(res.status).toBe(200);
    expect(res.body.hitRatePct).toBeNull();
  });

  it('skips kept deviation when EPD has no matching node (side unknown)', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    // No node for EPD — sideByEpd.get() returns undefined → !side → continue
    repo.appendDeviation({ id: randomUUID(), gameId: 'g1', ply: 3, epd: EPD, kind: 'lapse', playedUci: 'e2e4', bookUci: 'd2d4', resolution: 'alerted_kept', decisionMsTaken: 3000, provenanceId: provId, bookVersion: 0 });
    const res = await request(makeApp(repo)).get('/api/repertoire/refusals');
    expect(res.status).toBe(200);
    expect(res.body.keptInBookCount).toBe(0);
    expect(res.body.hitRatePct).toBe(0);
  });

  it('keptInBookCount 0 when kept move is not canonical or alt', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    repo.upsertNode({ epd: EPD, side: 'white', fen: EPD + ' 0 1', firstSeen: 1, lastSeen: 1, timesReached: 1, encounters: 1, minPly: 1, reachProb: null, reachStale: false, lineLoss: null, voteFrozenUntilEncounter: null });
    // e2e4 is a candidate, not canonical/alt
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'candidate', observations: 1, weightedScore: 1, meanWinLossPts: 0, worstWinLossPts: 0, auditId: null, gateReason: null, scoreW: 1, scoreD: 0, scoreL: 0, firstPlayed: 1, lastPlayed: 1 });
    repo.appendDeviation({ id: randomUUID(), gameId: 'g1', ply: 3, epd: EPD, kind: 'lapse', playedUci: 'e2e4', bookUci: 'd2d4', resolution: 'alerted_kept', decisionMsTaken: 3000, provenanceId: provId, bookVersion: 0 });
    const res = await request(makeApp(repo)).get('/api/repertoire/refusals');
    expect(res.status).toBe(200);
    expect(res.body.keptInBookCount).toBe(0);
    expect(res.body.hitRatePct).toBe(0);
  });

  it('returns 500 when repo throws', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.getAllDeviations = () => { throw new Error('db down'); };
    const res = await request(makeApp(repo)).get('/api/repertoire/refusals');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

describe('GET /api/repertoire/changelog', () => {
  it('returns empty when no changelog entries', async () => {
    const repo = new InMemoryRepertoireRepository();
    const res = await request(makeApp(repo)).get('/api/repertoire/changelog');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(0);
  });

  it('enriches entries with fromSan/toSan SAN fields', async () => {
    const repo = new InMemoryRepertoireRepository();
    // Starting position EPD — white to move, e2e4 is legal
    const startEpd = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22',
      sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null, appGitSha: null });
    repo.appendChangelog({ id: randomUUID(), at: Date.now(), epd: startEpd, side: 'white',
      kind: 'promote', fromUci: 'e2e4', toUci: 'd2d4', challengeId: null, rule: null,
      detailJson: null, provenanceId: provId, bookVersion: 1 });
    const res = await request(makeApp(repo)).get('/api/repertoire/changelog');
    expect(res.status).toBe(200);
    const entry = res.body.entries[0];
    expect(entry.fromSan).toBe('e4');
    expect(entry.toSan).toBe('d4');
  });

  it('returns 500 when repo throws', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.getChangelog = () => { throw new Error('db down'); };
    const res = await request(makeApp(repo)).get('/api/repertoire/changelog');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });
});

describe('POST /api/repertoire/changelog/:id/reverse', () => {
  it('returns 404 for unknown id', async () => {
    const repo = new InMemoryRepertoireRepository();
    const res = await request(makeApp(repo)).post(`/api/repertoire/changelog/${randomUUID()}/reverse`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('returns 409 for non-reversible kind', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    const entryId = randomUUID();
    repo.appendChangelog({ id: entryId, at: Date.now(), epd: EPD, side: 'white', kind: 'confirm', fromUci: 'd2d4', toUci: null, challengeId: null, rule: null, detailJson: null, provenanceId: provId, bookVersion: 1 });
    const res = await request(makeApp(repo)).post(`/api/repertoire/changelog/${entryId}/reverse`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_reversible');
  });

  it('reverses a promotion — restores previous roles', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    // Set up a promotion state
    repo.upsertNode({ epd: EPD, side: 'white', fen: EPD + ' 0 1', timesReached: 3, encounters: 3, firstSeen: 1_000, lastSeen: 3_000 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'd2d4', moveSan: 'd4', role: 'retired', observations: 5, scoreW: 2, scoreD: 1, scoreL: 0 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'canonical', observations: 2, scoreW: 1, scoreD: 0, scoreL: 0 });
    const entryId = randomUUID();
    repo.appendChangelog({ id: entryId, at: Date.now(), epd: EPD, side: 'white', kind: 'promote', fromUci: 'd2d4', toUci: 'e2e4', challengeId: null, rule: '3', detailJson: null, provenanceId: provId, bookVersion: 1 });

    const res = await request(makeApp(repo)).post(`/api/repertoire/changelog/${entryId}/reverse`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Moves should be restored
    expect(repo.getMove(EPD, 'white', 'd2d4').role).toBe('canonical');
    expect(repo.getMove(EPD, 'white', 'e2e4').role).toBe('retired');

    // A suppression should have been created for the reversed move (e2e4)
    const supp = repo.getSuppression(EPD, 'white', 'e2e4');
    expect(supp).not.toBeNull();
  });

  it('reverses a promotion with challengeId — closes the challenge as user_override', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    repo.upsertNode({ epd: EPD, side: 'white', fen: EPD + ' 0 1', timesReached: 3, encounters: 3, firstSeen: 1_000, lastSeen: 3_000 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'd2d4', moveSan: 'd4', role: 'retired', observations: 5, scoreW: 2, scoreD: 1, scoreL: 0 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'canonical', observations: 2, scoreW: 1, scoreD: 0, scoreL: 0 });

    // Open a challenge that the promotion closed
    const challengeId = randomUUID();
    repo.openChallenge({
      id: challengeId, epd: EPD, side: 'white', fen: EPD + ' 0 1',
      incumbentUci: 'd2d4', challengerUci: 'e2e4',
      openedGameId: 'g1', openedPly: 1, openedAt: 1_000,
      challengerPlays: 2, incumbentPlays: 1, encountersSinceOpen: 3,
      resultChallengerN: 0, resultIncumbentN: 0,
      status: 'promoted', provenanceId: provId, bookVersion: 1,
    });

    const entryId = randomUUID();
    repo.appendChangelog({ id: entryId, at: Date.now(), epd: EPD, side: 'white', kind: 'promote',
      fromUci: 'd2d4', toUci: 'e2e4', challengeId, rule: '3', detailJson: null, provenanceId: provId, bookVersion: 1 });

    const res = await request(makeApp(repo)).post(`/api/repertoire/changelog/${entryId}/reverse`);
    expect(res.status).toBe(200);

    // Challenge should now be rejected
    const ch = repo.getChallenge(challengeId);
    expect(ch.status).toBe('rejected');
    expect(ch.resolutionRule).toBe('user_override');
  });

  it('reverses a settle entry — restores challenger to challenger role', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    repo.upsertNode({ epd: EPD, side: 'white', fen: EPD + ' 0 1', timesReached: 3, encounters: 3, firstSeen: 1_000, lastSeen: 3_000 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'd2d4', moveSan: 'd4', role: 'canonical', observations: 5, scoreW: 2, scoreD: 1, scoreL: 0 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'alt', observations: 2, scoreW: 1, scoreD: 0, scoreL: 0 });

    // The settle entry has a challengeId pointing to a real challenge
    const challengeId = randomUUID();
    repo.openChallenge({
      id: challengeId, epd: EPD, side: 'white', fen: EPD + ' 0 1',
      incumbentUci: 'd2d4', challengerUci: 'e2e4',
      openedGameId: 'g1', openedPly: 1, openedAt: 1_000,
      challengerPlays: 2, incumbentPlays: 2, encountersSinceOpen: 4,
      resultChallengerN: 0, resultIncumbentN: 0,
      status: 'settled_both', provenanceId: provId, bookVersion: 1,
    });

    const entryId = randomUUID();
    repo.appendChangelog({ id: entryId, at: Date.now(), epd: EPD, side: 'white', kind: 'settle',
      fromUci: null, toUci: null, challengeId, rule: '9', detailJson: null, provenanceId: provId, bookVersion: 1 });

    const res = await request(makeApp(repo)).post(`/api/repertoire/changelog/${entryId}/reverse`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Challenger should be back to 'challenger' role (not alt)
    expect(repo.getMove(EPD, 'white', 'e2e4').role).toBe('challenger');
  });

  it('reverses a settle entry with no challengeId — handles null challengerMove', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    repo.upsertNode({ epd: EPD, side: 'white', fen: EPD + ' 0 1', timesReached: 2, encounters: 2, firstSeen: 1_000, lastSeen: 2_000 });

    const entryId = randomUUID();
    repo.appendChangelog({ id: entryId, at: Date.now(), epd: EPD, side: 'white', kind: 'settle',
      fromUci: null, toUci: null, challengeId: null, rule: '9', detailJson: null, provenanceId: provId, bookVersion: 1 });

    const res = await request(makeApp(repo)).post(`/api/repertoire/changelog/${entryId}/reverse`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 500 when repo throws during reverse', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.getChangelogEntry = () => { throw new Error('db down'); };
    const res = await request(makeApp(repo)).post(`/api/repertoire/changelog/${randomUUID()}/reverse`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal_error');
  });

  it('GET /api/repertoire/changelog with limit returns limited entries', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    for (let i = 0; i < 5; i++) {
      repo.appendChangelog({ id: randomUUID(), at: Date.now() + i, epd: EPD, side: 'white', kind: 'confirm',
        fromUci: 'd2d4', toUci: null, challengeId: null, rule: null, detailJson: null, provenanceId: provId, bookVersion: i });
    }
    const app = makeApp(repo);
    const res = await request(app).get('/api/repertoire/changelog?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);
  });

  it('GET /api/repertoire/refusals with alerted_corrected and alerted_timeout', async () => {
    const repo = new InMemoryRepertoireRepository();
    const provId = repo.getOrCreateProvenance({ balanceHash: 'x', schemaVersion: '22', sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null });
    repo.appendDeviation({ id: randomUUID(), gameId: 'g1', ply: 3, epd: EPD, kind: 'refused_repeat', playedUci: 'e2e4', bookUci: 'd2d4', resolution: 'alerted_corrected', decisionMsTaken: 3000, provenanceId: provId, bookVersion: 0 });
    repo.appendDeviation({ id: randomUUID(), gameId: 'g2', ply: 5, epd: EPD, kind: 'lapse', playedUci: 'e2e4', bookUci: 'd2d4', resolution: 'alerted_timeout', decisionMsTaken: null, provenanceId: provId, bookVersion: 0 });

    const app = makeApp(repo);
    const res = await request(app).get('/api/repertoire/refusals');
    expect(res.status).toBe(200);
    expect(res.body.refusals).toHaveLength(2);
  });

  it('GET /api/repertoire/coverage returns non-zero candidateCount', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode({ epd: EPD, side: 'white', fen: EPD + ' 0 1', timesReached: 2, encounters: 2, firstSeen: 1_000, lastSeen: 2_000 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'd2d4', moveSan: 'd4', role: 'candidate', observations: 2, scoreW: 1, scoreD: 0, scoreL: 0 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'canonical', observations: 3, scoreW: 2, scoreD: 0, scoreL: 0 });

    const app = makeApp(repo);
    const res = await request(app).get('/api/repertoire/coverage');
    expect(res.status).toBe(200);
    expect(res.body.candidateCount).toBe(1);
    expect(res.body.canonicalCount).toBe(1);
  });
});

describe('GET /api/repertoire/journey', () => {
  it('returns empty derived fields when no changelog entries', async () => {
    const repo = new InMemoryRepertoireRepository();
    const app = makeApp(repo);
    const res = await request(app).get('/api/repertoire/journey');
    expect(res.status).toBe(200);
    expect(res.body.timeline).toEqual([]);
    expect(res.body.growthSeries).toEqual([]);
    expect(res.body.milestones.firstConfirm).toBeNull();
  });

  it('returns populated timeline and growthSeries from changelog entries', async () => {
    const repo = new InMemoryRepertoireRepository();
    const at = new Date('2025-06-01').getTime();
    repo.appendChangelog({ id: 'c1', kind: 'confirm', at, epd: EPD, side: 'white',
      toUci: 'e2e4', bookVersion: 1, provenanceId: 'p1' });
    const app = makeApp(repo);
    const res = await request(app).get('/api/repertoire/journey');
    expect(res.status).toBe(200);
    expect(res.body.timeline).toHaveLength(1);
    expect(res.body.timeline[0].date).toBe('2025-06-01');
    expect(res.body.growthSeries).toHaveLength(1);
    expect(res.body.growthSeries[0].confirms).toBe(1);
    expect(res.body.growthSeries[0].total).toBe(1);
    expect(res.body.milestones.firstConfirm).toMatchObject({ kind: 'confirm' });
  });

  it('returns 500 when repo throws', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.getChangelogRange = () => { throw new Error('db error'); };
    const app = makeApp(repo);
    const res = await request(app).get('/api/repertoire/journey');
    expect(res.status).toBe(500);
  });
});
