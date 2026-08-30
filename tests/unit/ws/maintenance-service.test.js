/**
 * @module tests/unit/ws/maintenance-service
 * Unit tests for runBookMaintenance: canonical election, candidate expiry, quarantine re-audit.
 * Uses SQLite :memory: (Two-DB rule — never in-memory repos for gate logic).
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { openDb, SqliteRepertoireRepository } from '../../../src/adapters/sqlite/repositories.js';
import { runBookMaintenance } from '../../../src/api/ws/maintenance-service.js';
import { REP_CANDIDATE_TTL_ENCOUNTERS } from '../../../src/shared/balance.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EPD  = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq';
const SIDE = 'white';
const FEN  = EPD + ' e3 0 1';
const UCI1 = 'e2e4';
const UCI2 = 'd2d4';

let db, repo;
const NOW = Date.UTC(2025, 0, 6, 8, 0, 0);

function maintenance(overrides = {}) {
  return runBookMaintenance({
    repertoireRepo: repo,
    nowMs: NOW,
    provenanceId: 1,
    bookVersion: repo.getCurrentBookVersion(),
    ...overrides,
  });
}

function provenance() {
  return repo.getOrCreateProvenance({
    schemaVersion: '19', balanceHash: 'test', appGitSha: null,
    sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null,
  });
}

function ensureGame(gameId = 'g1') {
  // rep_observations has a FK on game_id → games.id; insert a stub game row
  db.prepare(`
    INSERT OR IGNORE INTO games
      (id, started_at, opponent_id, player_color, ranked, status, result, played_at)
    VALUES (?, ?, 'maia-1100', 'white', 1, 'finished', 'win', ?)
  `).run(gameId, NOW, NOW);
}

function upsertNode(overrides = {}) {
  repo.upsertNode({
    epd: EPD, side: SIDE, fen: FEN,
    firstSeen: NOW, lastSeen: NOW,
    timesReached: 1, encounters: 1,
    minPly: 1, reachProb: null, reachStale: false, lineLoss: 0,
    voteFrozenUntilEncounter: null,
    ...overrides,
  });
}

function upsertMove(uci, role, overrides = {}) {
  repo.upsertMove({
    epd: EPD, side: SIDE,
    moveUci: uci, moveSan: uci,
    role,
    observations: 2,
    weightedScore: null, meanWinLossPts: -5, worstWinLossPts: -5,
    auditId: null, gateReason: null,
    scoreW: 1, scoreD: 0, scoreL: 0,
    firstPlayed: NOW - 86_400_000, lastPlayed: NOW,
    ...overrides,
  });
}

let _obsSeq = 0;
function appendObs(uci, playedAt, source = 'game') {
  _obsSeq++;
  const gameId = `g${_obsSeq}`;
  ensureGame(gameId);
  const p = provenance();
  repo.appendObservation({
    gameId, ply: 1, epd: EPD, side: SIDE,
    moveUci: uci, moveSan: uci,
    winLossPts: -5, classification: 'excellent',
    playedAt, source,
    provenanceId: p, bookVersion: 1,
  });
}

beforeEach(() => {
  _obsSeq = 0;
  db   = openDb(':memory:');
  repo = new SqliteRepertoireRepository(db);
  provenance(); // ensure provenance id=1 exists
  ensureGame();
});

// ─── Canonical election ───────────────────────────────────────────────────────

describe('canonical election', () => {
  it('no-op when book is empty', async () => {
    const counts = await maintenance();
    expect(counts.elections).toBe(0);
  });

  it('no-op when single canonical move is already elected', async () => {
    upsertNode();
    upsertMove(UCI1, 'canonical');
    appendObs(UCI1, NOW - 86_400_000);
    appendObs(UCI1, NOW - 43_200_000);
    const counts = await maintenance();
    expect(counts.elections).toBe(0);
    expect(repo.getMove(EPD, SIDE, UCI1).role).toBe('canonical');
  });

  it('switches canonical to the more recently played move', async () => {
    upsertNode({ encounters: 4 });
    // UCI1 is current canonical but was played a long time ago
    upsertMove(UCI1, 'canonical', { meanWinLossPts: -5 });
    // UCI2 is alt but was played much more recently — should win the election
    upsertMove(UCI2, 'alt', { meanWinLossPts: -5 });

    // Two old obs for UCI1, two very recent for UCI2
    appendObs(UCI1, NOW - 30 * 86_400_000);
    appendObs(UCI1, NOW - 29 * 86_400_000);
    appendObs(UCI2, NOW - 1 * 86_400_000);
    appendObs(UCI2, NOW);

    const counts = await maintenance({ nowMs: NOW + 1 });
    expect(counts.elections).toBe(1);
    expect(repo.getMove(EPD, SIDE, UCI2).role).toBe('canonical');
    expect(repo.getMove(EPD, SIDE, UCI1).role).toBe('alt');
  });
});

// ─── Candidate expiry ─────────────────────────────────────────────────────────

describe('candidate expiry', () => {
  it('no-op when no candidates exist', async () => {
    upsertNode({ encounters: REP_CANDIDATE_TTL_ENCOUNTERS + 1 });
    upsertMove(UCI1, 'canonical');
    const counts = await maintenance();
    expect(counts.expirations).toBe(0);
  });

  it('does not expire candidate below TTL encounters', async () => {
    upsertNode({ encounters: REP_CANDIDATE_TTL_ENCOUNTERS - 1 });
    upsertMove(UCI2, 'candidate');
    const counts = await maintenance();
    expect(counts.expirations).toBe(0);
    expect(repo.getMove(EPD, SIDE, UCI2).role).toBe('candidate');
  });

  it('expires candidate at TTL encounters → retired', async () => {
    upsertNode({ encounters: REP_CANDIDATE_TTL_ENCOUNTERS });
    upsertMove(UCI2, 'candidate');
    const counts = await maintenance();
    expect(counts.expirations).toBe(1);
    expect(repo.getMove(EPD, SIDE, UCI2).role).toBe('retired');
  });

  it('writes a retire changelog entry', async () => {
    upsertNode({ encounters: REP_CANDIDATE_TTL_ENCOUNTERS });
    upsertMove(UCI2, 'candidate');
    await maintenance();
    const log = repo.getChangelog(10);
    expect(log.some(e => e.kind === 'retire' && e.fromUci === UCI2)).toBe(true);
  });
});

// ─── Quarantine re-audit ──────────────────────────────────────────────────────

describe('quarantine re-audit', () => {
  it('no-op when no quarantined moves exist', async () => {
    upsertNode();
    upsertMove(UCI1, 'canonical');
    const counts = await maintenance();
    expect(counts.reaudits).toBe(0);
  });

  it('promotes quarantined move to alt when mean win loss improves', async () => {
    upsertNode();
    // meanWinLossPts = -2 (well inside admitted band — below REP_ADMIT_WIN_PTS threshold)
    upsertMove(UCI2, 'quarantined', { meanWinLossPts: -2 });
    const counts = await maintenance();
    expect(counts.reaudits).toBe(1);
    expect(repo.getMove(EPD, SIDE, UCI2).role).toBe('alt');
  });

  it('demotes quarantined move to refused when mean win loss is large positive (blunder)', async () => {
    upsertNode();
    // reAuditQuarantined: winLossPts >= REP_QUARANTINE_WIN_PTS(20) → refused
    // The DB stores win_loss_pts as positive (magnitude of win% lost).
    upsertMove(UCI2, 'quarantined', { meanWinLossPts: 25 });
    const counts = await maintenance();
    expect(counts.reaudits).toBe(1);
    expect(repo.getMove(EPD, SIDE, UCI2).role).toBe('refused');
  });

  it('writes a quarantine_exit changelog entry on promotion', async () => {
    upsertNode();
    upsertMove(UCI2, 'quarantined', { meanWinLossPts: -2 });
    await maintenance();
    const log = repo.getChangelog(10);
    expect(log.some(e => e.kind === 'quarantine_exit')).toBe(true);
  });
});

// ─── Invariant 16: idempotence ────────────────────────────────────────────────

describe('invariant 16: maintenance idempotence', () => {
  it('running twice on unchanged evidence produces no second changelog entry', async () => {
    upsertNode({ encounters: REP_CANDIDATE_TTL_ENCOUNTERS });
    upsertMove(UCI2, 'candidate');

    await maintenance();
    const logAfterFirst = repo.getChangelog(50).length;

    // Second pass: no new candidates to expire (the one was just retired)
    await maintenance({ nowMs: NOW + 1000 });
    const logAfterSecond = repo.getChangelog(50).length;

    expect(logAfterSecond).toBe(logAfterFirst);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('swallows errors and returns zero counts', async () => {
    // Pass a broken repo to trigger an error
    const badRepo = {
      listNodes: () => { throw new Error('simulated failure'); },
      getCurrentBookVersion: () => 1,
    };
    const counts = await runBookMaintenance({
      repertoireRepo: badRepo, nowMs: NOW, provenanceId: 1, bookVersion: 1,
    });
    expect(counts).toEqual({ elections: 0, expirations: 0, reaudits: 0 });
  });
});
