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
});

describe('GET /api/repertoire/changelog', () => {
  it('returns empty when no changelog entries', async () => {
    const repo = new InMemoryRepertoireRepository();
    const res = await request(makeApp(repo)).get('/api/repertoire/changelog');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(0);
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
