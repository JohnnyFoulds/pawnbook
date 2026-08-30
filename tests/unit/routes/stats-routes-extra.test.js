/**
 * Extra branch coverage for stats routes.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

import { statsRouter } from '../../../src/api/routes/stats.js';
import { InMemoryPuzzleRepository, InMemorySettingsRepository } from '../../../src/adapters/memory/repositories.js';
import { FixedClock } from '../../../src/adapters/clock/fixed-clock.js';

const NOW = 1_700_000_000_000;

function makeStatsApp(gameRepo, puzzleRepo, settingsRepo) {
  const app = express();
  app.use(express.json());
  app.use('/api/stats', statsRouter({ gameRepo, puzzleRepo, settingsRepo, clock: new FixedClock(NOW) }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

describe('GET /api/stats — qualityMix', () => {
  it('qualityMix accumulates duplicate classifications (|| branch)', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();

    const gameRepo = {
      listRecent: () => [],
      getEloHistory: () => [],
      getCurrentElo: () => 1200,
      getStreak: () => 0,
      getPlayerMoveClassifications: () => [
        { classification: 'inaccuracy', played_at: NOW },
        { classification: 'inaccuracy', played_at: NOW + 1 },
        { classification: 'good', played_at: NOW + 2 },
      ],
    };

    const res = await request(makeStatsApp(gameRepo, puzzleRepo, settingsRepo)).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.qualityMix.inaccuracy).toBe(2);
    expect(res.body.qualityMix.good).toBe(1);
  });

  it('wins/losses/draws counted correctly', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    const gameRepo = {
      listRecent: () => [
        { status: 'finished', result: 'win' },
        { status: 'finished', result: 'loss' },
        { status: 'finished', result: 'draw' },
        { status: 'in_progress', result: null },
      ],
      getEloHistory: () => [],
      getCurrentElo: () => 1200,
      getStreak: () => 0,
      getPlayerMoveClassifications: () => [],
    };
    const res = await request(makeStatsApp(gameRepo, puzzleRepo, settingsRepo)).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.wins).toBe(1);
    expect(res.body.losses).toBe(1);
    expect(res.body.draws).toBe(1);
  });

  it('graduated and unknown-phase puzzles covered', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();

    const id = puzzleRepo.save({
      id: 'p1', kind: 'tactical',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      sideToMove: 'black', bestMoveUci: 'e7e5', bestMoveSan: 'e5',
      acceptedMovesJson: '["e7e5"]', playedMoveUci: null, playedMoveSan: null,
      cpLoss: 10, winLossPts: 5, classification: 'good', findability: 0.9,
      temptation: 0.8, instructiveness: 0.9, tags: '', maiaModel: null,
      policyTemperature: 1.0, eloAtCreation: 1200, sourceGameId: null,
      sourcePly: 1, phase: 'mystery_phase', wasTimed: 0,
    });
    puzzleRepo.saveCard({
      puzzleId: id, due: Date.now() - 1000, stability: 30,
      difficulty: 0.1, elapsedDays: 90, scheduledDays: 90,
      reps: 15, lapses: 0, state: 3, lastReview: null, graduated: 1,
    });

    const gameRepo = {
      listRecent: () => [],
      getEloHistory: () => [],
      getCurrentElo: () => 1200,
      getStreak: () => 0,
      getPlayerMoveClassifications: () => [],
    };

    const res = await request(makeStatsApp(gameRepo, puzzleRepo, settingsRepo)).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.graduatedCount).toBe(1);
    expect(res.body.activeCount).toBe(0);
    // 'mystery_phase' is not in phaseBreakdown keys — should be ignored gracefully
    expect(res.body.phaseBreakdown.mystery_phase).toBeUndefined();
  });

  it('finished game with non-standard result hits draw else-false branch', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    const gameRepo = {
      listRecent: () => [
        { status: 'finished', result: 'aborted' }, // not win/loss/draw
      ],
      getEloHistory: () => [],
      getCurrentElo: () => 1200,
      getStreak: () => 0,
      getPlayerMoveClassifications: () => [],
    };
    const res = await request(makeStatsApp(gameRepo, puzzleRepo, settingsRepo)).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.wins).toBe(0);
    expect(res.body.draws).toBe(0);
  });

  it('puzzleRepo without listAll uses fallback empty array', async () => {
    const settingsRepo = new InMemorySettingsRepository();
    const puzzleRepo = {
      getDueCards: () => [],
      getPracticeCards: () => [],
      // listAll intentionally absent
    };
    const gameRepo = {
      listRecent: () => [],
      getEloHistory: () => [],
      getCurrentElo: () => 1200,
      getStreak: () => 0,
      getPlayerMoveClassifications: () => [],
    };
    const res = await request(makeStatsApp(gameRepo, puzzleRepo, settingsRepo)).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.activeCount).toBe(0);
  });

  it('puzzle without createdAt hits null fallback branch', async () => {
    const settingsRepo = new InMemorySettingsRepository();
    const puzzleRepo = {
      getDueCards: () => [],
      listAll: () => [{ phase: 'opening', graduated: false }], // no created_at or createdAt
    };
    const gameRepo = {
      listRecent: () => [],
      getEloHistory: () => [],
      getCurrentElo: () => 1200,
      getStreak: () => 0,
      getPlayerMoveClassifications: () => [],
    };
    const res = await request(makeStatsApp(gameRepo, puzzleRepo, settingsRepo)).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.activeCount).toBe(1);
  });

  it('propagates errors via next(err) — catch block', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();

    const gameRepo = {
      getEloHistory: () => [],
      getPuzzleCountsByGameId: () => ({}),
      listRecent: () => { throw new Error('db down'); },
    };

    const res = await request(makeStatsApp(gameRepo, puzzleRepo, settingsRepo)).get('/api/stats');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('db down');
  });
});
