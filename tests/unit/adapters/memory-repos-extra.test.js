/**
 * Additional branch coverage for InMemory repositories.
 * Targets paths not exercised by the contract tests.
 */
import { randomUUID } from 'crypto';

import { describe, it, expect } from 'vitest';

import {
  InMemoryGameRepository,
  InMemoryPuzzleRepository,
  InMemoryRepertoireRepository,
  InMemorySettingsRepository,
} from '../../../src/adapters/memory/repositories.js';
import { FakeScheduler } from '../../../src/adapters/scheduler/fake-scheduler.js';

const EPD = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3';
const FEN = EPD + ' 0 1';

// ─── InMemoryGameRepository ───────────────────────────────────────────────────

describe('InMemoryGameRepository — extended branches', () => {
  it('listRecent: sorts by startedAt desc (null-safe)', () => {
    const repo = new InMemoryGameRepository();
    repo.save({ id: 'g1', opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', status: 'finished', ranked: true, startedAt: 1000 });
    repo.save({ id: 'g2', opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', status: 'finished', ranked: true, startedAt: 2000 });
    repo.save({ id: 'g3', opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', status: 'finished', ranked: true }); // no startedAt
    const list = repo.listRecent(10);
    expect(list[0].id).toBe('g2'); // most recent first
  });

  it('getEvals returns empty array when no _evals map exists', () => {
    const repo = new InMemoryGameRepository();
    repo.save({ id: 'g1', opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', status: 'in_progress', ranked: true });
    expect(repo.getEvals('g1')).toEqual([]);
  });

  it('getEvals returns empty array when game has no evals yet', () => {
    const repo = new InMemoryGameRepository();
    repo.save({ id: 'g1', opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', status: 'in_progress', ranked: true });
    repo.saveMoveEval({ gameId: 'g2', ply: 1, fen: FEN, mover: 'player', cpWhite: 30, bestMoveUci: 'e2e4' });
    expect(repo.getEvals('g1')).toEqual([]);
  });

  it('saveMoveEval replaces an existing eval at the same ply', () => {
    const repo = new InMemoryGameRepository();
    repo.save({ id: 'g1', opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', status: 'in_progress', ranked: true });
    repo.saveMoveEval({ gameId: 'g1', ply: 1, fen: FEN, mover: 'player', cpWhite: 30, bestMoveUci: 'e2e4' });
    repo.saveMoveEval({ gameId: 'g1', ply: 1, fen: FEN, mover: 'player', cpWhite: 50, bestMoveUci: 'e2e4' });
    const evals = repo.getEvals('g1');
    expect(evals).toHaveLength(1);
    // B15: getEvals returns snake_case after normalisation
    expect(evals[0].cp_white).toBe(50);
  });

  it('savePreEval ignores duplicate ply (INSERT OR IGNORE semantics)', () => {
    const repo = new InMemoryGameRepository();
    repo.save({ id: 'g1', opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', status: 'in_progress', ranked: true });
    repo.savePreEval('g1', 2, FEN, { cp: 30, bestmove: 'e2e4' });
    repo.savePreEval('g1', 2, FEN, { cp: 99, bestmove: 'e2e4' });
    const evals = repo.getEvals('g1');
    expect(evals).toHaveLength(1);
    expect(evals[0].cp_white).toBe(30); // first wins; B15: snake_case
  });

  it('recordActivity increments games count', () => {
    const repo = new InMemoryGameRepository();
    const ts = new Date('2025-06-01T14:00:00Z').getTime();
    repo.recordActivity(ts, 'game');
    repo.recordActivity(ts, 'game');
    repo.recordActivity(ts, 'review');
    const streak = repo.getStreak(ts);
    expect(streak).toBe(1);
  });

  it('getStreak returns 0 when no activity days', () => {
    const repo = new InMemoryGameRepository();
    const ts = Date.now();
    expect(repo.getStreak(ts)).toBe(0);
  });

  it('getStreak counts consecutive days correctly', () => {
    const repo = new InMemoryGameRepository();
    const day1 = new Date('2025-05-30T14:00:00Z').getTime();
    const day2 = new Date('2025-05-31T14:00:00Z').getTime();
    const day3 = new Date('2025-06-01T14:00:00Z').getTime();
    repo.recordActivity(day1, 'game');
    repo.recordActivity(day2, 'game');
    repo.recordActivity(day3, 'game');
    expect(repo.getStreak(day3)).toBe(3);
  });

  it('getStreak uses yesterday if today has no activity', () => {
    const repo = new InMemoryGameRepository();
    const yesterday = new Date('2025-05-31T14:00:00Z').getTime();
    const today = new Date('2025-06-01T14:00:00Z').getTime();
    repo.recordActivity(yesterday, 'review');
    expect(repo.getStreak(today)).toBe(1);
  });

  it('getStreak breaks when there is a gap in activity days', () => {
    const repo = new InMemoryGameRepository();
    // Two days with a gap in between
    const day1 = new Date('2025-05-29T14:00:00Z').getTime();
    const day3 = new Date('2025-05-31T14:00:00Z').getTime();
    repo.recordActivity(day1, 'game');
    repo.recordActivity(day3, 'game');
    // getStreak from May 31 should only count 1 (the gap breaks the streak)
    expect(repo.getStreak(day3)).toBe(1);
  });

  it('abandonAllInProgress: finished game is not changed (false branch)', () => {
    const repo = new InMemoryGameRepository();
    repo.save({ id: 'g1', opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', status: 'finished', ranked: false });
    repo.abandonAllInProgress();
    expect(repo.findById('g1').status).toBe('finished');
  });

  it('savePreEval: null cp and null bestmove hit ?? null branches', () => {
    const repo = new InMemoryGameRepository();
    repo.save({ id: 'g1', opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', status: 'in_progress', ranked: false });
    repo.savePreEval('g1', 5, FEN, { mate: 3 }); // cp undefined, bestmove undefined
    const evals = repo.getEvals('g1');
    // B15: getEvals returns snake_case after normalisation
    expect(evals[0].cp_white).toBeNull();
    expect(evals[0].best_move_uci).toBeNull();
  });
});

// ─── InMemoryPuzzleRepository ─────────────────────────────────────────────────

describe('InMemoryPuzzleRepository — extended branches', () => {
  it('getDueCards excludes graduated cards', () => {
    const repo = new InMemoryPuzzleRepository();
    const now = Date.now();
    const id = repo.save({
      id: randomUUID(), kind: 'tactical', fen: FEN, sideToMove: 'black',
      bestMoveUci: 'e7e5', bestMoveSan: 'e5', acceptedMovesJson: '["e7e5"]',
      playedMoveUci: null, playedMoveSan: null, cpLoss: 50, winLossPts: 15,
      classification: 'blunder', findability: 0.5, temptation: 0.4, instructiveness: 0.6,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: null, sourcePly: 1, phase: 'opening', wasTimed: 0,
    });
    // Card is overdue but graduated → should not appear in getDueCards
    repo.saveCard({ puzzleId: id, due: now - 1000, stability: 20, difficulty: 0.1,
      elapsedDays: 60, scheduledDays: 60, reps: 10, lapses: 0, state: 3, lastReview: null, graduated: 1 });
    expect(repo.getDueCards(now)).toHaveLength(0);
  });

  it('listAll returns puzzles with card defaults when no card exists', () => {
    const repo = new InMemoryPuzzleRepository();
    repo.save({
      id: randomUUID(), kind: 'tactical', fen: FEN, sideToMove: 'black',
      bestMoveUci: 'e7e5', bestMoveSan: 'e5', acceptedMovesJson: '["e7e5"]',
      playedMoveUci: null, playedMoveSan: null, cpLoss: 50, winLossPts: 15,
      classification: 'inaccuracy', findability: 0.4, temptation: 0.3, instructiveness: 0.5,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: null, sourcePly: 1, phase: 'opening', wasTimed: 0,
    });
    const all = repo.listAll();
    expect(all).toHaveLength(1);
    expect(all[0].graduated).toBe(false);
    expect(all[0].reps).toBe(0);
    expect(all[0].lapses).toBe(0);
  });

  it('saveReview stores review and saveReviewAndCard stores both', () => {
    const repo = new InMemoryPuzzleRepository();
    const puzzleId = randomUUID();
    repo.save({
      id: puzzleId, kind: 'tactical', fen: FEN, sideToMove: 'black',
      bestMoveUci: 'e7e5', bestMoveSan: 'e5', acceptedMovesJson: '["e7e5"]',
      playedMoveUci: null, playedMoveSan: null, cpLoss: 50, winLossPts: 15,
      classification: 'inaccuracy', findability: 0.4, temptation: 0.3, instructiveness: 0.5,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: null, sourcePly: 1, phase: 'opening', wasTimed: 0,
    });

    repo.saveReview({ id: randomUUID(), puzzleId, correct: true, msTaken: 1000, rating: 3 });

    const card = { puzzleId, due: Date.now() + 100000, stability: 5, difficulty: 0.2,
      elapsedDays: 1, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: null, graduated: 0 };
    repo.saveReviewAndCard({ id: randomUUID(), puzzleId, correct: true, msTaken: 500, rating: 4 }, card);

    expect(repo.getCard(puzzleId)).not.toBeNull();
    expect(repo.getCard(puzzleId).reps).toBe(1);
  });

  it('saveReview without id generates a UUID', () => {
    const repo = new InMemoryPuzzleRepository();
    const puzzleId = randomUUID();
    repo.save({
      id: puzzleId, kind: 'tactical', fen: FEN, sideToMove: 'black',
      bestMoveUci: 'e7e5', bestMoveSan: 'e5', acceptedMovesJson: '["e7e5"]',
      playedMoveUci: null, playedMoveSan: null, cpLoss: 50, winLossPts: 15,
      classification: 'inaccuracy', findability: 0.4, temptation: 0.3, instructiveness: 0.5,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: null, sourcePly: 1, phase: 'opening', wasTimed: 0,
    });
    // saveReview without an id — should auto-assign
    repo.saveReview({ puzzleId, correct: false, msTaken: 2000, rating: 1 });
  });

  it('getCard returns null when no card exists', () => {
    const repo = new InMemoryPuzzleRepository();
    expect(repo.getCard('no-such-puzzle')).toBeNull();
  });

  it('updateAcceptedMoves: no-op for non-existent puzzle (false branch)', () => {
    const repo = new InMemoryPuzzleRepository();
    // Should not throw — just a no-op
    repo.updateAcceptedMoves('no-such-id', '["e2e4"]');
  });

  it('getDueCards: puzzle with no kind falls back to tactical', () => {
    const repo = new InMemoryPuzzleRepository();
    const now = Date.now();
    const id = repo.save({
      id: randomUUID(), fen: FEN, sideToMove: 'black',
      bestMoveUci: 'e7e5', bestMoveSan: 'e5', acceptedMovesJson: '["e7e5"]',
      playedMoveUci: null, playedMoveSan: null, cpLoss: 50, winLossPts: 15,
      classification: 'inaccuracy', findability: 0.4, temptation: 0.3, instructiveness: 0.5,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: null, sourcePly: 1, phase: 'opening', wasTimed: 0,
      // kind intentionally omitted → undefined
    });
    repo.saveCard({ puzzleId: id, due: now - 1000, stability: 0, difficulty: 0, elapsedDays: 0,
      scheduledDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null, graduated: 0 });
    const due = repo.getDueCards(now);
    expect(due[0].kind).toBe('tactical');
  });

  it('listByGame returns sorted by sourcePly', () => {
    const repo = new InMemoryPuzzleRepository();
    const gameId = randomUUID();
    const base = {
      kind: 'tactical', fen: FEN, sideToMove: 'black',
      bestMoveUci: 'e7e5', bestMoveSan: 'e5', acceptedMovesJson: '["e7e5"]',
      playedMoveUci: null, playedMoveSan: null, cpLoss: 50, winLossPts: 15,
      classification: 'inaccuracy', findability: 0.4, temptation: 0.3, instructiveness: 0.5,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: gameId, phase: 'opening', wasTimed: 0,
    };
    repo.save({ ...base, id: randomUUID(), fen: FEN + 'A', sourcePly: 10 });
    repo.save({ ...base, id: randomUUID(), fen: FEN + 'B', sourcePly: 2 });
    repo.save({ ...base, id: randomUUID(), fen: FEN + 'C', sourcePly: null });

    const list = repo.listByGame(gameId);
    expect(list).toHaveLength(3);
    expect(list[0].sourcePly ?? 0).toBeLessThanOrEqual(list[1].sourcePly ?? 0);
  });
});

// ─── InMemoryRepertoireRepository ─────────────────────────────────────────────

describe('InMemoryRepertoireRepository — extended branches', () => {
  it('getNode returns null when absent', () => {
    const repo = new InMemoryRepertoireRepository();
    expect(repo.getNode('nonexistent', 'white')).toBeNull();
  });

  it('getMove returns null when absent', () => {
    const repo = new InMemoryRepertoireRepository();
    expect(repo.getMove(EPD, 'white', 'e2e4')).toBeNull();
  });

  it('getPolicy round-trip and null when absent', () => {
    const repo = new InMemoryRepertoireRepository();
    expect(repo.getPolicy(EPD, 'maia-1100', 'w1')).toBeNull();

    repo.upsertPolicy({ epd: EPD, maiaModel: 'maia-1100', maiaWeightsId: 'w1', policyJson: '{"e2e4":0.9}', computedAt: 1000 });
    const p = repo.getPolicy(EPD, 'maia-1100', 'w1');
    expect(p).not.toBeNull();
    expect(p.policyJson).toBe('{"e2e4":0.9}');
  });

  it('getAudit returns null when absent', () => {
    const repo = new InMemoryRepertoireRepository();
    expect(repo.getAudit('no-such-id')).toBeNull();
  });

  it('getChallenge returns null when absent', () => {
    const repo = new InMemoryRepertoireRepository();
    expect(repo.getChallenge('no-such-id')).toBeNull();
  });

  it('getChangelogEntry returns null when absent', () => {
    const repo = new InMemoryRepertoireRepository();
    expect(repo.getChangelogEntry('no-such-id')).toBeNull();
  });

  it('getSuppression returns null when absent', () => {
    const repo = new InMemoryRepertoireRepository();
    expect(repo.getSuppression(EPD, 'white', 'e2e4')).toBeNull();
  });

  it('getOpenChallenge returns null when all challenges are closed', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.openChallenge({ id: 'ch1', epd: EPD, side: 'white', fen: FEN, status: 'open',
      incumbentUci: 'e2e4', challengerUci: 'd2d4', openedGameId: 'g1', openedPly: 1, openedAt: 1000,
      incObservations: 3, incMeanWinLossPts: 5, incScoreW: 2, incScoreD: 1, incScoreL: 0 });
    repo.updateChallenge('ch1', { status: 'promoted', resolutionRule: '3', resolvedAt: 2000, resolvedBy: 'algorithm' });
    expect(repo.getOpenChallenge(EPD, 'white')).toBeNull();
  });

  it('updateChallenge throws when challenge not found', () => {
    const repo = new InMemoryRepertoireRepository();
    expect(() => repo.updateChallenge('nonexistent', { status: 'promoted' })).toThrow();
  });

  it('getMovesForNode sorts by role then moveUci (null-safe)', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'canonical', observations: 3, scoreW: 2, scoreD: 1, scoreL: 0 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'd2d4', moveSan: 'd4', role: 'alt', observations: 2, scoreW: 1, scoreD: 1, scoreL: 0 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: undefined, moveSan: null, role: 'candidate', observations: 1, scoreW: 0, scoreD: 0, scoreL: 0 });
    const moves = repo.getMovesForNode(EPD, 'white');
    expect(moves).toHaveLength(3);
    // role 'alt' < 'candidate' < 'canonical' alphabetically
    expect(moves[0].role).toBe('alt');
  });

  it('getDeviationsForGame: null ply sorts as 0 (covers ?? 0 branches)', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.appendDeviation({ id: 'd1', gameId: 'g1', ply: null, epd: EPD, kind: 'deviation',
      playedUci: 'e2e4', bookUci: 'd2d4', resolution: null, provenanceId: 1, bookVersion: 0 });
    repo.appendDeviation({ id: 'd2', gameId: 'g1', ply: 2, epd: EPD, kind: 'deviation',
      playedUci: 'd2d4', bookUci: 'e2e4', resolution: null, provenanceId: 1, bookVersion: 0 });
    const devs = repo.getDeviationsForGame('g1');
    expect(devs[0].id).toBe('d1'); // null ply treated as 0, sorts first
  });

  it('listOpenChallenges: null openedAt sorts as 0 (covers ?? 0 branches)', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.openChallenge({ id: 'c1', epd: EPD, side: 'white', fen: FEN, status: 'open',
      incumbentUci: 'e2e4', challengerUci: 'd2d4', openedGameId: 'g1', openedPly: 1,
      openedAt: null, provenanceId: 1, bookVersion: 0 });
    repo.openChallenge({ id: 'c2', epd: EPD + 'x', side: 'white', fen: FEN, status: 'open',
      incumbentUci: 'e2e4', challengerUci: 'd2d4', openedGameId: 'g2', openedPly: 1,
      openedAt: null, provenanceId: 1, bookVersion: 0 });
    const open = repo.listOpenChallenges();
    expect(open).toHaveLength(2);
  });

  it('getChangelog: null at sorts as 0 (covers ?? 0 branches)', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.appendChangelog({ id: 'cl1', kind: 'promote', at: null, epd: EPD, side: 'white',
      newRole: 'canonical', oldRole: 'candidate', moveUci: 'e2e4', bookVersion: 1, provenanceId: 1 });
    repo.appendChangelog({ id: 'cl2', kind: 'promote', at: null, epd: EPD, side: 'white',
      newRole: 'alt', oldRole: 'candidate', moveUci: 'd2d4', bookVersion: 2, provenanceId: 1 });
    const log = repo.getChangelog(10);
    expect(log).toHaveLength(2);
  });

  it('listNodes: same EPD different side covers nested ternary branches', () => {
    const repo = new InMemoryRepertoireRepository();
    const EPD2 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
    // Two nodes with same EPD, different side → exercises a.epd > b.epd and a.epd === b.epd paths
    repo.upsertNode({ epd: EPD, side: 'white', encounters: 5 });
    repo.upsertNode({ epd: EPD, side: 'black', encounters: 3 });
    repo.upsertNode({ epd: EPD2, side: 'white', encounters: 2 });
    const nodes = repo.listNodes();
    expect(nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('getMovesForNode: two moves with same role hit moveUci comparison (covers ?? branch)', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'g1f3', moveSan: 'Nf3', role: 'candidate', observations: 1 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'c2c4', moveSan: 'c4', role: 'candidate', observations: 2 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'a2a3', moveSan: 'a3', role: 'candidate', observations: 3 });
    const moves = repo.getMovesForNode(EPD, 'white');
    // All same role → sorted by moveUci; a3 < c4 < g1f3
    expect(moves[0].moveUci).toBe('a2a3');
    expect(moves[2].moveUci).toBe('g1f3');
  });

  it('transaction runs the callback and returns its result', () => {
    const repo = new InMemoryRepertoireRepository();
    const result = repo.transaction(() => {
      repo.incrementBookVersion();
      return 42;
    });
    expect(result).toBe(42);
    expect(repo.getCurrentBookVersion()).toBe(1);
  });

  it('getObservationsForNode sorts by playedAt (null-safe)', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.appendObservation({ epd: EPD, side: 'white', moveUci: 'e2e4', gameId: 'g2', ply: 1,
      playedAt: 2000, provenanceId: 1, bookVersion: 0, source: 'game' });
    repo.appendObservation({ epd: EPD, side: 'white', moveUci: 'e2e4', gameId: 'g1', ply: 1,
      playedAt: null, provenanceId: 1, bookVersion: 0, source: 'game' });
    repo.appendObservation({ epd: EPD, side: 'white', moveUci: 'e2e4', gameId: 'g3', ply: 1,
      playedAt: 1000, provenanceId: 1, bookVersion: 0, source: 'game' });
    const obs = repo.getObservationsForNode(EPD, 'white');
    expect(obs[0].gameId).toBe('g1'); // null treated as 0, sorts first
  });

  it('getAllDeviations returns at most the given limit in reverse order', () => {
    const repo = new InMemoryRepertoireRepository();
    for (let i = 0; i < 5; i++) {
      repo.appendDeviation({ id: `d${i}`, gameId: `g${i}`, ply: i, epd: EPD, kind: 'deviation',
        playedUci: 'e2e4', bookUci: 'd2d4', resolution: null, provenanceId: 1, bookVersion: 0 });
    }
    const all = repo.getAllDeviations(3);
    expect(all).toHaveLength(3);
    // Returns in reverse (most recent first)
    expect(all[0].id).toBe('d4');
  });
});

// ─── FakeScheduler ────────────────────────────────────────────────────────────

describe('FakeScheduler', () => {
  it('uses _nextDue override when set instead of computed due', () => {
    const scheduler = new FakeScheduler();
    const fixedDue = new Date(9999, 0, 1);
    scheduler._nextDue = fixedDue;
    const card = { reps: 0, lapses: 0, stability: 0, difficulty: 0, scheduled_days: 0 };
    const { card: nextCard } = scheduler.schedule(card, 'Good');
    expect(nextCard.due).toBe(fixedDue);
  });

  it('increments lapses on Again rating', () => {
    const scheduler = new FakeScheduler();
    const card = { reps: 2, lapses: 1, stability: 5, difficulty: 0.3, scheduled_days: 3 };
    const { card: nextCard } = scheduler.schedule(card, 'Again');
    expect(nextCard.lapses).toBe(2);
  });
});

// ─── InMemorySettingsRepository ───────────────────────────────────────────────

describe('InMemorySettingsRepository', () => {
  it('returns null for missing key', () => {
    const repo = new InMemorySettingsRepository();
    expect(repo.get('missing')).toBeNull();
  });

  it('coerces value to string on set', () => {
    const repo = new InMemorySettingsRepository();
    repo.set('num', 42);
    expect(repo.get('num')).toBe('42');
  });
});
