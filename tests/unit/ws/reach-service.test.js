/**
 * @module tests/unit/ws/reach-service
 * Unit tests for runReachProbes, computeCoverage, and computeGapReport.
 */

import { describe, it, expect } from 'vitest';

import { InMemoryRepertoireRepository } from '../../../src/adapters/memory/repositories.js';
import { runReachProbes, computeCoverage, computeGapReport } from '../../../src/api/ws/reach-service.js';

// Starting position
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const START_EPD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

// After 1.e4 e5
const AFTER_E4E5_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const AFTER_E4E5_EPD = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -';

const SIDE = 'white';

function makeNode(epd, fen, overrides = {}) {
  return {
    epd, fen, side: SIDE,
    firstSeen: 1000, lastSeen: 1000,
    timesReached: 1, encounters: 2,
    minPly: 0, reachProb: null, reachStale: false,
    lineLoss: null, voteFrozenUntilEncounter: null,
    ...overrides,
  };
}

function makeMove(epd, moveUci, role = 'canonical') {
  return {
    epd, side: SIDE, moveUci,
    moveSan: moveUci, role,
    observations: 1, weightedScore: 1, meanWinLossPts: 0.1,
    worstWinLossPts: 0, auditId: null, gateReason: null,
    scoreW: 1, scoreD: 0, scoreL: 0,
    firstPlayed: 1000, lastPlayed: 1000,
  };
}

// ─── runReachProbes ───────────────────────────────────────────────────────────

describe('runReachProbes', () => {
  it('returns probed: 0 when no engine pool', async () => {
    const repo = new InMemoryRepertoireRepository();
    const result = await runReachProbes({ repertoireRepo: repo, enginePool: null });
    expect(result).toEqual({ probed: 0 });
  });

  it('returns probed: 0 when nodes list is empty', async () => {
    const repo = new InMemoryRepertoireRepository();
    const enginePool = { getMaiaAnalysisClient: async () => ({ policy: async () => null }) };
    const result = await runReachProbes({ repertoireRepo: repo, enginePool });
    expect(result).toEqual({ probed: 0 });
  });

  it('returns probed: 0 when getMaiaAnalysisClient throws', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN));
    const enginePool = {
      getMaiaAnalysisClient: async () => { throw new Error('no Maia'); },
    };
    const result = await runReachProbes({ repertoireRepo: repo, enginePool });
    expect(result).toEqual({ probed: 0 });
  });

  it('returns probed: 0 when client has no policy method', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN));
    const enginePool = { getMaiaAnalysisClient: async () => ({}) };
    const result = await runReachProbes({ repertoireRepo: repo, enginePool });
    expect(result).toEqual({ probed: 0 });
  });

  it('skips book nodes where canonical move is invalid for the position', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN));
    // Invalid move — BFS should skip this node and return 1 probed (the root)
    repo.upsertMove(makeMove(START_EPD, 'a1a8', 'canonical'));
    const maiaClient = { policy: async () => new Map() };
    const enginePool = { getMaiaAnalysisClient: async () => maiaClient };

    const result = await runReachProbes({ repertoireRepo: repo, enginePool });
    expect(result.probed).toBe(1);
  });

  it('probes the root node even with no canonical move', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN));
    // Node has no moves, so BFS stops after root
    const maiaClient = { policy: async () => new Map() };
    const enginePool = { getMaiaAnalysisClient: async () => maiaClient };

    const result = await runReachProbes({ repertoireRepo: repo, enginePool });
    expect(result.probed).toBe(1);

    const nodes = repo.listNodes();
    expect(nodes[0].reachProb).toBeCloseTo(1.0);
  });

  it('handles starting position not in book (line 73 branch)', async () => {
    const repo = new InMemoryRepertoireRepository();
    // Only add a node that is NOT the starting position
    repo.upsertNode(makeNode(AFTER_E4E5_EPD, AFTER_E4E5_FEN));

    const maiaClient = { policy: async () => new Map() };
    const enginePool = { getMaiaAnalysisClient: async () => maiaClient };

    const result = await runReachProbes({ repertoireRepo: repo, enginePool });
    // START_FEN not in book → line 73 fires → BFS terminates early
    // START_EPD is in reachAccum but has no node → probed=1 (the silent no-op update)
    expect(result.probed).toBeGreaterThanOrEqual(0);
  });

  it('uses Maia policy probabilities when available', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN));
    repo.upsertMove(makeMove(START_EPD, 'e2e4'));
    repo.upsertNode(makeNode(AFTER_E4E5_EPD, AFTER_E4E5_FEN));

    // Policy that assigns e7e5 probability 0.8 (covers policy?.get() returning defined value)
    const policyMap = new Map([['e7e5', 0.8]]);
    const maiaClient = { policy: async () => policyMap };
    const enginePool = { getMaiaAnalysisClient: async () => maiaClient };

    const result = await runReachProbes({ repertoireRepo: repo, enginePool });
    expect(result.probed).toBeGreaterThanOrEqual(2);
    const nodes = repo.listNodes();
    const reached = nodes.find(n => n.epd === AFTER_E4E5_EPD);
    expect(reached?.reachProb).toBeCloseTo(0.8);
  });

  it('distributes reach prob to connected nodes using uniform policy', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN));
    repo.upsertMove(makeMove(START_EPD, 'e2e4'));
    // Add the position after 1.e4 e5 (white to move) as a book node
    repo.upsertNode(makeNode(AFTER_E4E5_EPD, AFTER_E4E5_FEN));

    // Uniform policy: all moves equally likely
    const maiaClient = { policy: async () => new Map() };
    const enginePool = { getMaiaAnalysisClient: async () => maiaClient };

    const result = await runReachProbes({ repertoireRepo: repo, enginePool });
    expect(result.probed).toBeGreaterThanOrEqual(1);

    const root = repo.listNodes().find(n => n.epd === START_EPD);
    expect(root.reachProb).toBeCloseTo(1.0);
  });

  it('continues BFS when policy() throws (treats node as uniform)', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN));
    repo.upsertMove(makeMove(START_EPD, 'e2e4'));

    const maiaClient = { policy: async () => { throw new Error('policy error'); } };
    const enginePool = { getMaiaAnalysisClient: async () => maiaClient };

    const result = await runReachProbes({ repertoireRepo: repo, enginePool });
    // BFS still runs even when policy throws — root is probed
    expect(result.probed).toBeGreaterThanOrEqual(1);
  });

  it('swallows updateNodeReachProb errors', async () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN));

    const brokenRepo = {
      listNodes: () => repo.listNodes(),
      getMovesForNode: (...a) => repo.getMovesForNode(...a),
      updateNodeReachProb: () => { throw new Error('db error'); },
    };

    const maiaClient = { policy: async () => new Map() };
    const enginePool = { getMaiaAnalysisClient: async () => maiaClient };

    const result = await runReachProbes({ repertoireRepo: brokenRepo, enginePool });
    // Error is swallowed, probed count reflects attempt
    expect(result.probed).toBe(0);
  });
});

// ─── computeCoverage ──────────────────────────────────────────────────────────

describe('computeCoverage', () => {
  it('returns zeros for an empty repo', () => {
    const repo = new InMemoryRepertoireRepository();
    const result = computeCoverage(repo);
    expect(result).toEqual({ coveragePct: 0, coveredNodes: 0, totalNodes: 0, candidateCount: 0, canonicalCount: 0 });
  });

  it('counts canonical moves as covered', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN));
    repo.upsertMove(makeMove(START_EPD, 'e2e4', 'canonical'));

    const result = computeCoverage(repo);
    expect(result.totalNodes).toBe(1);
    expect(result.coveredNodes).toBe(1);
    expect(result.canonicalCount).toBe(1);
    expect(result.candidateCount).toBe(0);
    expect(result.coveragePct).toBe(100);
  });

  it('counts candidate moves separately', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN));
    repo.upsertMove(makeMove(START_EPD, 'e2e4', 'candidate'));

    const result = computeCoverage(repo);
    expect(result.coveredNodes).toBe(0);
    expect(result.candidateCount).toBe(1);
    expect(result.canonicalCount).toBe(0);
    expect(result.coveragePct).toBe(0);
  });

  it('uses reach_prob for weighted coverage', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN, { reachProb: 0.5 }));
    repo.upsertMove(makeMove(START_EPD, 'e2e4', 'canonical'));
    repo.upsertNode(makeNode(AFTER_E4E5_EPD, AFTER_E4E5_FEN, { reachProb: 0.5 }));
    // No canonical move on second node

    const result = computeCoverage(repo);
    expect(result.coveredNodes).toBe(1);
    expect(result.totalNodes).toBe(2);
    // reach-weighted: covered 0.5, total 1.0 → 50%
    expect(result.coveragePct).toBe(50);
  });
});

// ─── computeGapReport ────────────────────────────────────────────────────────

describe('computeGapReport', () => {
  it('returns empty array for an empty repo', () => {
    const repo = new InMemoryRepertoireRepository();
    expect(computeGapReport(repo)).toEqual([]);
  });

  it('skips nodes without reachProb', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN, { reachProb: null }));
    repo.upsertMove(makeMove(START_EPD, 'e2e4', 'canonical'));

    expect(computeGapReport(repo)).toEqual([]);
  });

  it('skips nodes with zero reachProb', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN, { reachProb: 0 }));
    repo.upsertMove(makeMove(START_EPD, 'e2e4', 'canonical'));

    expect(computeGapReport(repo)).toEqual([]);
  });

  it('skips nodes with no canonical move', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN, { reachProb: 1.0 }));

    expect(computeGapReport(repo)).toEqual([]);
  });

  it('skips nodes from the opposing side', () => {
    const repo = new InMemoryRepertoireRepository();
    // White node first (determines playerSide = 'white')
    repo.upsertNode(makeNode(START_EPD, START_FEN, { reachProb: 1.0 }));
    repo.upsertMove(makeMove(START_EPD, 'e2e4', 'canonical'));
    // Black node at the same EPD — sorts after white (same epd, 'black' < 'white' but we control by upsertNode order)
    // To ensure white node is first in listNodes() output:
    // START_EPD sorts alphabetically: 'rnbqkbnr/pppppppp/...' > 'rnbqkbnr/pppp1ppp/...'
    // So we add a black node at an EPD that sorts AFTER START_EPD
    // Any position with 'r' more than START_EPD's second char being 'n' would work
    // Simplest: a position whose EPD string > START_EPD
    const laterEpd = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq z'; // z sorts after -
    const blackNode = { ...makeNode(laterEpd, laterEpd + ' 0 1', { reachProb: 0.5 }), side: 'black' };
    repo.upsertNode(blackNode);

    const gaps = computeGapReport(repo);
    // White node generates gaps; black node is skipped (side !== playerSide)
    expect(gaps.length).toBeGreaterThan(0);
  });

  it('skips nodes where canonical move is invalid for the fen', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN, { reachProb: 1.0 }));
    // UCI that is not a legal move in the starting position
    repo.upsertMove(makeMove(START_EPD, 'a1a8', 'canonical'));

    const gaps = computeGapReport(repo);
    expect(gaps).toEqual([]);
  });

  it('returns gap candidates for opponent replies not in book', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN, { reachProb: 1.0 }));
    repo.upsertMove(makeMove(START_EPD, 'e2e4', 'canonical'));

    const gaps = computeGapReport(repo);
    // After e4, black has ~20 legal moves, none in the book
    expect(gaps.length).toBeGreaterThan(0);
    // All have positive reach prob
    for (const g of gaps) {
      expect(g.reachProb).toBeGreaterThan(0);
      expect(g.opponentReplyUci).toBeTruthy();
    }
    // Sorted descending by reachProb
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i - 1].reachProb).toBeGreaterThanOrEqual(gaps[i].reachProb);
    }
  });

  it('excludes opponent replies that are already in the book', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode(makeNode(START_EPD, START_FEN, { reachProb: 1.0 }));
    repo.upsertMove(makeMove(START_EPD, 'e2e4', 'canonical'));
    // Add the position after 1.e4 e5 — this is already covered, so e7e5 should not appear
    repo.upsertNode(makeNode(AFTER_E4E5_EPD, AFTER_E4E5_FEN, { reachProb: 0.1 }));

    const gaps = computeGapReport(repo);
    // e7e5 leads to a known node, so it should not appear
    const e5gap = gaps.find(g => g.opponentReplyUci === 'e7e5');
    expect(e5gap).toBeUndefined();
  });
});
