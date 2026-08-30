/**
 * Unit tests for state and stats REST routes.
 */
import { randomUUID } from 'crypto';

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

import { stateRouter } from '../../../src/api/routes/state.js';
import { statsRouter } from '../../../src/api/routes/stats.js';
import { InMemoryGameRepository, InMemoryPuzzleRepository, InMemorySettingsRepository } from '../../../src/adapters/memory/repositories.js';
import { FixedClock } from '../../../src/adapters/clock/fixed-clock.js';

const NOW = new Date('2025-06-01T10:00:00Z');

function makeStateApp(gameRepo, puzzleRepo, settingsRepo) {
  const app = express();
  app.use(express.json());
  app.use('/api/state', stateRouter({
    settingsRepo,
    puzzleRepo,
    gameRepo,
    clock: new FixedClock(NOW),
  }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

function makeStatsApp(gameRepo, puzzleRepo, settingsRepo) {
  const app = express();
  app.use(express.json());
  app.use('/api/stats', statsRouter({
    gameRepo,
    puzzleRepo,
    settingsRepo,
    clock: new FixedClock(NOW),
  }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

describe('GET /api/state', () => {
  it('returns ok status with defaults on empty DB', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();

    const res = await request(makeStateApp(gameRepo, puzzleRepo, settingsRepo))
      .get('/api/state');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.elo).toBe(1200);
    expect(res.body.dueCount).toBe(0);
    expect(res.body.recentGames).toEqual([]);
  });

  it('returns showStreak=false when setting is 0', async () => {
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('show_streak', '0');
    const res = await request(makeStateApp(new InMemoryGameRepository(), new InMemoryPuzzleRepository(), settingsRepo))
      .get('/api/state');
    expect(res.status).toBe(200);
    expect(res.body.showStreak).toBe(false);
  });

  it('returns eloDelta when elo history has 2+ entries', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();

    const id1 = randomUUID();
    const id2 = randomUUID();
    gameRepo.save({ id: id1, opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', ranked: true, status: 'finished', result: 'win', termination: 'checkmate' });
    gameRepo.updateElo(id1, { eloBefore: 1200, eloAfter: 1210, historyId: randomUUID(), recordedAt: Date.now() });
    gameRepo.save({ id: id2, opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', ranked: true, status: 'finished', result: 'win', termination: 'checkmate' });
    gameRepo.updateElo(id2, { eloBefore: 1210, eloAfter: 1222, historyId: randomUUID(), recordedAt: Date.now() + 1 });

    const res = await request(makeStateApp(gameRepo, puzzleRepo, settingsRepo))
      .get('/api/state');
    expect(res.status).toBe(200);
    expect(res.body.eloDelta).toBe(12);
  });

  it('includes in-progress game id when one exists', async () => {
    const gameRepo = new InMemoryGameRepository();
    const id = randomUUID();
    gameRepo.save({ id, opponentId: 'maia-1300', opponentElo: 1300, playerColor: 'black', ranked: true, status: 'in_progress' });
    const res = await request(makeStateApp(gameRepo, new InMemoryPuzzleRepository(), new InMemorySettingsRepository()))
      .get('/api/state');
    expect(res.status).toBe(200);
    expect(res.body.inProgressGameId).toBe(id);
  });
});

describe('GET /api/stats', () => {
  it('returns zeros on empty DB', async () => {
    const res = await request(makeStatsApp(new InMemoryGameRepository(), new InMemoryPuzzleRepository(), new InMemorySettingsRepository()))
      .get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.wins).toBe(0);
    expect(res.body.losses).toBe(0);
    expect(res.body.draws).toBe(0);
    expect(res.body.activeCount).toBe(0);
  });

  it('counts wins losses draws from finished games', async () => {
    const gameRepo = new InMemoryGameRepository();
    gameRepo.save({ id: randomUUID(), opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', ranked: true, status: 'finished', result: 'win', termination: 'checkmate' });
    gameRepo.save({ id: randomUUID(), opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', ranked: true, status: 'finished', result: 'loss', termination: 'checkmate' });
    gameRepo.save({ id: randomUUID(), opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', ranked: true, status: 'finished', result: 'draw', termination: 'stalemate' });
    const res = await request(makeStatsApp(gameRepo, new InMemoryPuzzleRepository(), new InMemorySettingsRepository()))
      .get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.wins).toBe(1);
    expect(res.body.losses).toBe(1);
    expect(res.body.draws).toBe(1);
  });

  it('returns eloDelta when elo history has 2+ entries', async () => {
    const gameRepo = new InMemoryGameRepository();
    const id1 = randomUUID();
    const id2 = randomUUID();
    gameRepo.save({ id: id1, opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', ranked: true, status: 'finished', result: 'win', termination: 'checkmate' });
    gameRepo.updateElo(id1, { eloBefore: 1200, eloAfter: 1215, historyId: randomUUID(), recordedAt: Date.now() });
    gameRepo.save({ id: id2, opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', ranked: true, status: 'finished', result: 'win', termination: 'checkmate' });
    gameRepo.updateElo(id2, { eloBefore: 1215, eloAfter: 1227, historyId: randomUUID(), recordedAt: Date.now() + 1 });
    const res = await request(makeStatsApp(gameRepo, new InMemoryPuzzleRepository(), new InMemorySettingsRepository()))
      .get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.eloDelta).toBe(12);
  });

  it('counts active and graduated puzzles and phase breakdown', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();

    const FEN_BASE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const makePuzzleRow = (fen, phase) => ({
      id: randomUUID(), kind: 'tactical', fen, sideToMove: 'black',
      bestMoveUci: 'e7e5', bestMoveSan: 'e5', acceptedMovesJson: '["e7e5"]',
      playedMoveUci: 'd7d5', playedMoveSan: 'd5', cpLoss: 50, winLossPts: 15,
      classification: 'inaccuracy', findability: 0.4, temptation: 0.3, instructiveness: 0.5,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: null, sourcePly: 1, phase, wasTimed: 0,
    });

    // Opening puzzle — active card (not graduated)
    const p1 = makePuzzleRow(FEN_BASE, 'opening');
    const id1 = puzzleRepo.save(p1);
    puzzleRepo.saveCard({ puzzleId: id1, due: Date.now() + 100000, stability: 0, difficulty: 0,
      elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null, graduated: 0 });

    // Middlegame puzzle — graduated card
    const p2 = makePuzzleRow(FEN_BASE + ' ', 'middlegame');
    const id2 = puzzleRepo.save(p2);
    puzzleRepo.saveCard({ puzzleId: id2, due: Date.now() + 200000, stability: 10, difficulty: 0.2,
      elapsedDays: 30, scheduledDays: 30, reps: 5, lapses: 0, state: 3, lastReview: null, graduated: 1 });

    const res = await request(makeStatsApp(gameRepo, puzzleRepo, settingsRepo))
      .get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.activeCount).toBe(1);
    expect(res.body.graduatedCount).toBe(1);
    expect(res.body.phaseBreakdown.opening).toBe(1);
    expect(res.body.phaseBreakdown.middlegame).toBe(1);
    expect(res.body.phaseBreakdown.endgame).toBe(0);
  });

  it('includes gameHistory for finished games', async () => {
    const gameRepo = new InMemoryGameRepository();
    gameRepo.save({ id: randomUUID(), opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', ranked: true, status: 'finished', result: 'win', termination: 'checkmate', playedAt: Date.now() });
    gameRepo.save({ id: randomUUID(), opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', ranked: true, status: 'in_progress' });
    const res = await request(makeStatsApp(gameRepo, new InMemoryPuzzleRepository(), new InMemorySettingsRepository()))
      .get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.gameHistory).toHaveLength(1);
    expect(res.body.gameHistory[0].result).toBe('win');
  });
});
