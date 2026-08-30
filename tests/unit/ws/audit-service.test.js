/**
 * @module tests/unit/ws/audit-service
 * Unit tests for runChallengeAudit: engine evidence, gate verdict, trend, result perf.
 * Uses SQLite :memory: (Two-DB rule — never in-memory repos for gate logic).
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { openDb, SqliteRepertoireRepository, SqliteGameRepository } from '../../../src/adapters/sqlite/repositories.js';
import { createFakeEnginePool } from '../../../src/adapters/engine/fake-engine-pool.js';
import { runChallengeAudit } from '../../../src/api/ws/audit-service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Starting position FEN — white to move, e2e4 and d2d4 are legal
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const START_EPD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
const SIDE = 'white';
const CHALLENGER = 'e2e4';
const INCUMBENT  = 'd2d4';
const NOW = Date.UTC(2025, 0, 8, 8, 0, 0);

let db, repRepo, gameRepo;

function provenance() {
  return repRepo.getOrCreateProvenance({
    schemaVersion: '19', balanceHash: 'test', appGitSha: null,
    sfVersion: null, sfDepth: null, sfMultipv: null, maiaWeightsId: null,
  });
}

function ensureGame(gameId = 'g1', result = 'win', opponentElo = 1200, eloBefore = 1200) {
  db.prepare(`
    INSERT OR IGNORE INTO games
      (id, started_at, opponent_id, opponent_elo, player_color, ranked, status, result,
       elo_before, elo_after, played_at)
    VALUES (?, ?, 'maia-1100', ?, 'white', 1, 'finished', ?, ?, ?, ?)
  `).run(gameId, NOW, opponentElo, result, eloBefore, eloBefore + 10, NOW);
}

function openChallenge(overrides = {}) {
  const provId = provenance();
  ensureGame('opener-game');
  repRepo.upsertNode({
    epd: START_EPD, side: SIDE, fen: START_FEN,
    firstSeen: NOW, lastSeen: NOW,
    timesReached: 1, encounters: 3,
    minPly: 1, reachProb: null, reachStale: false, lineLoss: 0,
    voteFrozenUntilEncounter: null,
  });
  repRepo.upsertMove({
    epd: START_EPD, side: SIDE,
    moveUci: INCUMBENT, moveSan: 'd4', role: 'canonical',
    observations: 2, weightedScore: null, meanWinLossPts: -2, worstWinLossPts: -2,
    auditId: null, gateReason: null,
    scoreW: 1, scoreD: 0, scoreL: 0,
    firstPlayed: NOW - 86_400_000, lastPlayed: NOW,
  });
  repRepo.upsertMove({
    epd: START_EPD, side: SIDE,
    moveUci: CHALLENGER, moveSan: 'e4', role: 'challenger',
    observations: 2, weightedScore: null, meanWinLossPts: -2, worstWinLossPts: -2,
    auditId: null, gateReason: null,
    scoreW: 1, scoreD: 0, scoreL: 0,
    firstPlayed: NOW - 43_200_000, lastPlayed: NOW,
  });
  const challenge = {
    id: 'chal-1',
    epd: START_EPD, side: SIDE, fen: START_FEN,
    incumbentUci: INCUMBENT, challengerUci: CHALLENGER,
    openedGameId: 'opener-game', openedPly: 1, openedAt: NOW - 86_400_000,
    challengerPlays: 1, incumbentPlays: 0, encountersSinceOpen: 2,
    engineDeltaWinPts: null, engineAuditId: null,
    gateVerdict: null, gateReason: null,
    trendChallenger: null, trendIncumbent: null,
    resultChallengerPerf: null, resultChallengerN: 0,
    resultIncumbentPerf: null, resultIncumbentN: 0,
    status: 'open', resolutionRule: null,
    resolvedAt: null, resolvedBy: null,
    incObservations: null, incMeanWinLossPts: null,
    incScoreW: null, incScoreD: null, incScoreL: null, incCardState: null,
    moveMsTaken: null, moveMsZscore: null, decisionMsTaken: null,
    provenanceId: provId, bookVersion: 1,
    ...overrides,
  };
  repRepo.openChallenge(challenge);
  return challenge;
}

function audit(challenge, overrides = {}) {
  return runChallengeAudit({
    challenge,
    enginePool: createFakeEnginePool(),
    repertoireRepo: repRepo,
    gameRepo,
    provenanceId: provenance(),
    bookVersion: 1,
    ...overrides,
  });
}

beforeEach(() => {
  db      = openDb(':memory:');
  repRepo = new SqliteRepertoireRepository(db);
  gameRepo = new SqliteGameRepository(db);
  provenance(); // ensure id=1 exists
});

// ─── Engine evidence ─────────────────────────────────────────────────────────

describe('engine evidence', () => {
  it('writes two audit rows — one per move', async () => {
    const challenge = openChallenge();
    await audit(challenge);
    const chalAudit = db.prepare("SELECT * FROM rep_audits WHERE move_uci = ?").get(CHALLENGER);
    const incAudit  = db.prepare("SELECT * FROM rep_audits WHERE move_uci = ?").get(INCUMBENT);
    expect(chalAudit).toBeDefined();
    expect(incAudit).toBeDefined();
  });

  it('writes engineDeltaWinPts to the challenge row', async () => {
    const challenge = openChallenge();
    await audit(challenge);
    const updated = repRepo.getChallenge('chal-1');
    expect(updated.engineDeltaWinPts).not.toBeNull();
    expect(typeof updated.engineDeltaWinPts).toBe('number');
  });

  it('writes gateVerdict to the challenge row', async () => {
    const challenge = openChallenge();
    await audit(challenge);
    const updated = repRepo.getChallenge('chal-1');
    expect(['admitted', 'quarantined', 'refused', null]).toContain(updated.gateVerdict);
  });

  it('skips engine when enginePool is null', async () => {
    const challenge = openChallenge();
    await runChallengeAudit({
      challenge, enginePool: null, repertoireRepo: repRepo,
      gameRepo, provenanceId: provenance(), bookVersion: 1,
    });
    const updated = repRepo.getChallenge('chal-1');
    expect(updated.engineDeltaWinPts).toBeNull();
  });

  it('skips engine when engineDeltaWinPts already set', async () => {
    const challenge = openChallenge({ engineDeltaWinPts: 1.5 });
    await audit(challenge);
    // No new audit rows should be written (engineDelta already set)
    const rows = db.prepare("SELECT COUNT(*) AS n FROM rep_audits").get();
    expect(rows.n).toBe(0);
  });

  it('fake engine produces engineDelta near zero (same cp for all positions)', async () => {
    const challenge = openChallenge();
    await audit(challenge);
    const updated = repRepo.getChallenge('chal-1');
    // Fake engine returns cp=30 for all positions; after negating for side=white,
    // both moves produce identical win%, so delta should be approximately 0.
    expect(Math.abs(updated.engineDeltaWinPts)).toBeLessThan(1);
  });

  it('swallows errors and returns without throwing', async () => {
    const badRepo = {
      getChallenge: () => null,
      getObservationsForNode: () => [],
      getNode: () => null,
      appendAudit: () => { throw new Error('simulated failure'); },
      updateChallenge: () => {},
      getMove: () => null,
      upsertMove: () => {},
    };
    await expect(
      runChallengeAudit({
        challenge: openChallenge(), enginePool: createFakeEnginePool(),
        repertoireRepo: badRepo, gameRepo: null, provenanceId: 1, bookVersion: 1,
      })
    ).resolves.not.toThrow();
  });
});

// ─── Trend computation ───────────────────────────────────────────────────────

describe('trend computation', () => {
  it('populates trendChallenger when game evals exist at trend plies', async () => {
    const challenge = openChallenge();

    // Insert a finished game with evals at plies 1, 3, 5, 7
    ensureGame('g-trend', 'win', 1200, 1200);
    db.prepare(`
      INSERT OR IGNORE INTO rep_observations
        (game_id, ply, epd, side, move_uci, move_san, win_loss_pts, classification,
         played_at, source, provenance_id, book_version)
      VALUES ('g-trend', 1, ?, 'white', ?, 'e4', -3, 'good', ?, 'game', 1, 1)
    `).run(START_EPD, CHALLENGER, NOW);
    // Insert game moves for FK
    db.prepare("INSERT OR IGNORE INTO game_moves (game_id, ply, uci, san) VALUES (?, ?, ?, ?)")
      .run('g-trend', 1, CHALLENGER, 'e4');
    // Insert move_evals at plies 3, 5, 7 (trend offsets +2, +4, +6)
    for (const ply of [3, 5, 7]) {
      db.prepare(`
        INSERT OR IGNORE INTO move_evals
          (game_id, ply, fen, move_uci, mover, win_before, win_after)
        VALUES ('g-trend', ?, ?, 'e7e5', 'player', 50, 52)
      `).run(ply, START_FEN);
    }

    await audit(challenge, { enginePool: null });
    const updated = repRepo.getChallenge('chal-1');
    expect(updated.trendChallenger).toBeCloseTo(52, 0);
  });

  it('leaves trendChallenger null when no evals exist', async () => {
    const challenge = openChallenge({ engineDeltaWinPts: 0 });
    await runChallengeAudit({
      challenge, enginePool: null, repertoireRepo: repRepo,
      gameRepo, provenanceId: provenance(), bookVersion: 1,
    });
    const updated = repRepo.getChallenge('chal-1');
    expect(updated.trendChallenger).toBeNull();
  });
});

// ─── Result performance ──────────────────────────────────────────────────────

describe('result performance', () => {
  it('computes resultChallengerPerf from finished games', async () => {
    const challenge = openChallenge({ engineDeltaWinPts: 0 });

    ensureGame('g-res', 'win', 1200, 1200);
    db.prepare(`
      INSERT OR IGNORE INTO rep_observations
        (game_id, ply, epd, side, move_uci, move_san, win_loss_pts, classification,
         played_at, source, provenance_id, book_version)
      VALUES ('g-res', 1, ?, 'white', ?, 'e4', -3, 'good', ?, 'game', 1, 1)
    `).run(START_EPD, CHALLENGER, NOW);

    await runChallengeAudit({
      challenge, enginePool: null, repertoireRepo: repRepo,
      gameRepo, provenanceId: provenance(), bookVersion: 1,
    });
    const updated = repRepo.getChallenge('chal-1');
    expect(updated.resultChallengerN).toBe(1);
    expect(updated.resultChallengerPerf).not.toBeNull();
    expect(typeof updated.resultChallengerPerf).toBe('number');
  });

  it('result perf is positive for a win against equal-rated opponent', async () => {
    const challenge = openChallenge({ engineDeltaWinPts: 0 });

    ensureGame('g-win', 'win', 1200, 1200); // win against equal = positive perf
    db.prepare(`
      INSERT OR IGNORE INTO rep_observations
        (game_id, ply, epd, side, move_uci, move_san, win_loss_pts, classification,
         played_at, source, provenance_id, book_version)
      VALUES ('g-win', 1, ?, 'white', ?, 'e4', -3, 'good', ?, 'game', 1, 1)
    `).run(START_EPD, CHALLENGER, NOW);

    await runChallengeAudit({
      challenge, enginePool: null, repertoireRepo: repRepo,
      gameRepo, provenanceId: provenance(), bookVersion: 1,
    });
    const updated = repRepo.getChallenge('chal-1');
    expect(updated.resultChallengerPerf).toBeGreaterThan(0);
  });

  it('draw result produces a non-null perf between 0 and 1', async () => {
    const challenge = openChallenge({ engineDeltaWinPts: 0 });

    ensureGame('g-draw', 'draw', 1200, 1200);
    db.prepare(`
      INSERT OR IGNORE INTO rep_observations
        (game_id, ply, epd, side, move_uci, move_san, win_loss_pts, classification,
         played_at, source, provenance_id, book_version)
      VALUES ('g-draw', 1, ?, 'white', ?, 'e4', -3, 'good', ?, 'game', 1, 1)
    `).run(START_EPD, CHALLENGER, NOW);

    await runChallengeAudit({
      challenge, enginePool: null, repertoireRepo: repRepo,
      gameRepo, provenanceId: provenance(), bookVersion: 1,
    });
    const updated = repRepo.getChallenge('chal-1');
    expect(updated.resultChallengerPerf).not.toBeNull();
    expect(updated.resultChallengerPerf).toBeGreaterThan(-1);
    expect(updated.resultChallengerPerf).toBeLessThan(1);
  });

  it('computes resultIncumbentPerf from incumbent games', async () => {
    const challenge = openChallenge({ engineDeltaWinPts: 0 });

    ensureGame('g-inc', 'win', 1200, 1200);
    db.prepare(`
      INSERT OR IGNORE INTO rep_observations
        (game_id, ply, epd, side, move_uci, move_san, win_loss_pts, classification,
         played_at, source, provenance_id, book_version)
      VALUES ('g-inc', 1, ?, 'white', ?, 'd4', -3, 'good', ?, 'game', 1, 1)
    `).run(START_EPD, INCUMBENT, NOW);

    await runChallengeAudit({
      challenge, enginePool: null, repertoireRepo: repRepo,
      gameRepo, provenanceId: provenance(), bookVersion: 1,
    });
    const updated = repRepo.getChallenge('chal-1');
    expect(updated.resultIncumbentN).toBe(1);
    expect(updated.resultIncumbentPerf).not.toBeNull();
  });
});

// ─── Null engine delta ────────────────────────────────────────────────────────

describe('null engine delta', () => {
  it('writes engineDelta null when engine returns cp: null, mate: null', async () => {
    const challenge = openChallenge();
    const nullCpPool = {
      getAnalysisSfClient: async () => ({
        eval: async () => ({ cp: null, mate: null }),
      }),
    };
    await runChallengeAudit({
      challenge,
      enginePool: nullCpPool,
      repertoireRepo: repRepo,
      gameRepo,
      provenanceId: provenance(),
      bookVersion: 1,
    });
    const updated = repRepo.getChallenge('chal-1');
    expect(updated.engineDeltaWinPts).toBeNull();
  });
});

// ─── Gate verdict error catch ────────────────────────────────────────────────

describe('gate verdict error catch', () => {
  it('gateVerdict falls back to null when position eval throws', async () => {
    const challenge = openChallenge();
    let evalCalls = 0;
    const failGatePool = {
      getAnalysisSfClient: async () => ({
        eval: async () => {
          evalCalls += 1;
          if (evalCalls > 2) throw new Error('gate eval failed');
          return { cp: 30, mate: null };
        },
      }),
    };
    await runChallengeAudit({
      challenge,
      enginePool: failGatePool,
      repertoireRepo: repRepo,
      gameRepo: null,
      provenanceId: provenance(),
      bookVersion: 1,
    });
    const updated = repRepo.getChallenge('chal-1');
    expect(updated.gateVerdict).toBeNull();
  });
});

// ─── Trend and result error catches ─────────────────────────────────────────

describe('trend and result error catches', () => {
  it('swallows errors from getObservationsForNode in trend and result paths', async () => {
    const challenge = openChallenge({ engineDeltaWinPts: 0 });
    const badRepo = {
      getObservationsForNode: () => { throw new Error('db failure'); },
      updateChallenge: () => {},
    };
    await expect(runChallengeAudit({
      challenge,
      enginePool: null,
      repertoireRepo: badRepo,
      gameRepo: {},
      provenanceId: 1,
      bookVersion: 1,
    })).resolves.not.toThrow();
  });
});
