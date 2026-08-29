/**
 * Unit tests for puzzles REST routes.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { puzzlesRouter } from '../../../src/api/routes/puzzles.js';
import { InMemoryPuzzleRepository, InMemorySettingsRepository } from '../../../src/adapters/memory/repositories.js';
import { FakeScheduler } from '../../../src/adapters/scheduler/fake-scheduler.js';
import { FixedClock } from '../../../src/adapters/clock/fixed-clock.js';

const NOW = new Date('2025-01-15T12:00:00Z');

function makeApp(puzzleRepo, opts = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/puzzles', puzzlesRouter({
    puzzleRepo,
    scheduler: opts.scheduler ?? new FakeScheduler(),
    clock: opts.clock ?? new FixedClock(NOW),
    settingsRepo: new InMemorySettingsRepository(),
  }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

function makePuzzle(repo, overrides = {}) {
  const id = randomUUID();
  repo.save({
    id,
    kind: 'tactical',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    sideToMove: 'black',
    bestMoveUci: 'e7e5',
    bestMoveSan: 'e5',
    acceptedMovesJson: JSON.stringify(['e7e5']),
    playedMoveUci: 'd7d5',
    playedMoveSan: 'd5',
    cpLoss: 50,
    winLossPts: 15,
    classification: 'inaccuracy',
    findability: 0.4,
    temptation: 0.3,
    instructiveness: 0.5,
    tags: '',
    maiaModel: null,
    policyTemperature: 1.0,
    eloAtCreation: 1200,
    sourceGameId: null,
    sourcePly: 1,
    phase: 'opening',
    wasTimed: 0,
    ...overrides,
  });
  repo.saveCard({
    puzzleId: id,
    due: NOW.getTime() - 1000, // overdue
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: null,
    graduated: 0,
  });
  return id;
}

describe('GET /api/puzzles/due', () => {
  it('returns empty when no due cards', async () => {
    const res = await request(makeApp(new InMemoryPuzzleRepository()))
      .get('/api/puzzles/due');
    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns due cards', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    makePuzzle(puzzleRepo);
    const res = await request(makeApp(puzzleRepo)).get('/api/puzzles/due');
    expect(res.status).toBe(200);
    expect(res.body.cards).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('displayTotal shows DUE_SOFT_CAP+ when overCap (covers overCap true branch)', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    // Add 41 overdue puzzles to trigger DUE_SOFT_CAP (40) overflow
    for (let i = 0; i < 41; i++) {
      makePuzzle(puzzleRepo);
    }
    const res = await request(makeApp(puzzleRepo)).get('/api/puzzles/due');
    expect(res.status).toBe(200);
    expect(res.body.displayTotal).toBe('40+');
  });
});

describe('GET /api/puzzles/practice', () => {
  it('returns empty when no practice cards', async () => {
    const res = await request(makeApp(new InMemoryPuzzleRepository()))
      .get('/api/puzzles/practice');
    expect(res.status).toBe(200);
    expect(res.body.cards).toEqual([]);
  });
});

describe('POST /api/puzzles/:id/attempt', () => {
  it('grades a correct attempt', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const id = makePuzzle(puzzleRepo);
    const res = await request(makeApp(puzzleRepo))
      .post(`/api/puzzles/${id}/attempt`)
      .send({ move: 'e7e5', msTaken: 1000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
  });

  it('grades an incorrect attempt', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const id = makePuzzle(puzzleRepo);
    const res = await request(makeApp(puzzleRepo))
      .post(`/api/puzzles/${id}/attempt`)
      .send({ move: 'd7d5', msTaken: 500, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
  });

  it('handles quiz phase attempt', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const id = makePuzzle(puzzleRepo);
    const res = await request(makeApp(puzzleRepo))
      .post(`/api/puzzles/${id}/attempt`)
      .send({ move: 'e7e5', msTaken: 800, hintUsed: false, attemptNo: 1, phase: 'quiz' });
    expect(res.status).toBe(200);
  });

  it('returns 500 for invalid move format', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const id = makePuzzle(puzzleRepo);
    const res = await request(makeApp(puzzleRepo))
      .post(`/api/puzzles/${id}/attempt`)
      .send({ move: 'bad', msTaken: 500 });
    expect(res.status).toBe(500);
  });

  it('quiz phase without existing card creates practice card (covers isPractice && !card branch)', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    // Save puzzle but NO card
    const id = randomUUID();
    puzzleRepo.save({
      id,
      kind: 'tactical',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      sideToMove: 'black',
      bestMoveUci: 'e7e5',
      bestMoveSan: 'e5',
      acceptedMovesJson: JSON.stringify(['e7e5']),
      playedMoveUci: 'd7d5',
      playedMoveSan: 'd5',
      cpLoss: 50,
      winLossPts: 15,
      classification: 'inaccuracy',
      findability: 0.4,
      temptation: 0.3,
      instructiveness: 0.5,
      tags: '',
      maiaModel: null,
      policyTemperature: 1.0,
      eloAtCreation: 1200,
      sourceGameId: null,
      sourcePly: 1,
      phase: 'opening',
      wasTimed: 0,
    });
    // No saveCard — card is null
    const res = await request(makeApp(puzzleRepo))
      .post(`/api/puzzles/${id}/attempt`)
      .send({ move: 'e7e5', msTaken: 1000, hintUsed: false, attemptNo: 1, phase: 'quiz' });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
    // Card should now exist with due = tomorrow
    const card = puzzleRepo.getCard(id);
    expect(card).not.toBeNull();
  });

  it('drill attempt without existing card covers card-null branches (lines 78, 92)', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const id = randomUUID();
    // Save puzzle WITHOUT calling saveCard
    puzzleRepo.save({
      id,
      kind: 'tactical',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      sideToMove: 'black',
      bestMoveUci: 'e7e5',
      bestMoveSan: 'e5',
      acceptedMovesJson: JSON.stringify(['e7e5']),
      playedMoveUci: 'd7d5',
      playedMoveSan: 'd5',
      cpLoss: 50,
      winLossPts: 15,
      classification: 'inaccuracy',
      findability: 0.4,
      temptation: 0.3,
      instructiveness: 0.5,
      tags: '',
      maiaModel: null,
      policyTemperature: 1.0,
      eloAtCreation: 1200,
      sourceGameId: null,
      sourcePly: 1,
      phase: 'opening',
      wasTimed: 0,
    });
    // No saveCard — drill (not quiz) attempt: card is null, triggers card ?? scheduler.newCard?.()
    const res = await request(makeApp(puzzleRepo))
      .post(`/api/puzzles/${id}/attempt`)
      .send({ move: 'e7e5', msTaken: 1000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
  });

  it('puzzle with snake_case best_move_san and win_loss_pts covers fallback branches', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const id = randomUUID();
    // Save puzzle using snake_case fields instead of camelCase
    puzzleRepo.save({
      id,
      kind: 'tactical',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      sideToMove: 'black',
      bestMoveUci: 'e7e5',
      best_move_san: 'e5',        // snake_case — covers bestMoveSan ?? best_move_san branch
      acceptedMovesJson: JSON.stringify(['e7e5']),
      playedMoveUci: 'd7d5',
      playedMoveSan: 'd5',
      cpLoss: 50,
      win_loss_pts: 15,           // snake_case — covers winLossPts ?? win_loss_pts branch
      classification: 'inaccuracy',
      findability: 0.4,
      temptation: 0.3,
      instructiveness: 0.5,
      tags: '',
      maiaModel: null,
      policyTemperature: 1.0,
      eloAtCreation: 1200,
      sourceGameId: null,
      sourcePly: 1,
      phase: 'opening',
      wasTimed: 0,
    });
    puzzleRepo.saveCard({
      puzzleId: id,
      due: NOW.getTime() - 1000,
      stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0,
      reps: 0, lapses: 0, state: 0, lastReview: null, graduated: 0,
    });
    const res = await request(makeApp(puzzleRepo))
      .post(`/api/puzzles/${id}/attempt`)
      .send({ move: 'e7e5', msTaken: 1000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
    expect(res.body.bestMoveSan).toBe('e5');
    expect(res.body.winLoss).toBe(15);
  });

  it('puzzle with pv set covers pv non-null branch (line 135)', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const id = randomUUID();
    puzzleRepo.save({
      id,
      kind: 'tactical',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      sideToMove: 'black',
      bestMoveUci: 'e7e5',
      bestMoveSan: 'e5',
      pv: 'e7e5 d2d4',           // non-null pv — covers pv ?? null non-null branch
      acceptedMovesJson: JSON.stringify(['e7e5']),
      playedMoveUci: 'd7d5',
      playedMoveSan: 'd5',
      cpLoss: 50,
      winLossPts: 15,
      classification: 'inaccuracy',
      findability: 0.4,
      temptation: 0.3,
      instructiveness: 0.5,
      tags: '',
      maiaModel: null,
      policyTemperature: 1.0,
      eloAtCreation: 1200,
      sourceGameId: null,
      sourcePly: 1,
      phase: 'opening',
      wasTimed: 0,
    });
    puzzleRepo.saveCard({
      puzzleId: id,
      due: NOW.getTime() - 1000,
      stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0,
      reps: 0, lapses: 0, state: 0, lastReview: null, graduated: 0,
    });
    const res = await request(makeApp(puzzleRepo))
      .post(`/api/puzzles/${id}/attempt`)
      .send({ move: 'e7e5', msTaken: 1000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
    expect(res.body.pv).toBe('e7e5 d2d4');
  });

  it('saveReview throw is swallowed — verdict still returned (covers saveReview catch)', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const id = makePuzzle(puzzleRepo);
    // Patch saveReview to throw
    const originalSaveReview = puzzleRepo.saveReview.bind(puzzleRepo);
    puzzleRepo.saveReview = () => { throw new Error('review db down'); };
    const res = await request(makeApp(puzzleRepo))
      .post(`/api/puzzles/${id}/attempt`)
      .send({ move: 'e7e5', msTaken: 1000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    // Should still succeed despite saveReview failure
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
    puzzleRepo.saveReview = originalSaveReview;
  });
});
