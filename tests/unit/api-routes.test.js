/**
 * API route tests — covers all branches in api/routes/*.js.
 * Uses supertest against a minimal Express app with in-memory dependencies.
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';

import { opponentsRouter } from '../../src/api/routes/opponents.js';
import { stateRouter }     from '../../src/api/routes/state.js';
import { statsRouter }     from '../../src/api/routes/stats.js';
import { gamesRouter }     from '../../src/api/routes/games.js';
import { puzzlesRouter }   from '../../src/api/routes/puzzles.js';
import { debugRouter }    from '../../src/api/routes/debug.js';
import { errorMiddleware } from '../../src/api/error-middleware.js';
import {
  InMemoryGameRepository,
  InMemoryPuzzleRepository,
  InMemorySettingsRepository,
} from '../../src/adapters/memory/repositories.js';
import { FixedClock }     from '../../src/adapters/clock/fixed-clock.js';
import { FakeScheduler }  from '../../src/adapters/scheduler/fake-scheduler.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000; // fixed epoch ms

function buildApp({
  gameRepo, puzzleRepo, settingsRepo, clock, scheduler, enginePool,
} = {}) {
  gameRepo     ??= new InMemoryGameRepository();
  puzzleRepo   ??= new InMemoryPuzzleRepository();
  settingsRepo ??= new InMemorySettingsRepository();
  clock        ??= new FixedClock(NOW);
  scheduler    ??= new FakeScheduler();

  const app = express();
  app.use(express.json());
  app.use('/api/opponents', opponentsRouter());
  app.use('/api/state',     stateRouter({ settingsRepo, puzzleRepo, gameRepo, clock }));
  app.use('/api/stats',     statsRouter({ gameRepo, puzzleRepo, settingsRepo, clock }));
  app.use('/api/games',     gamesRouter({ gameRepo, puzzleRepo, settingsRepo, enginePool }));
  app.use('/api/puzzles',   puzzlesRouter({ puzzleRepo, scheduler, clock, settingsRepo }));
  app.use('/api/debug',     debugRouter({ gameRepo }));
  app.use(errorMiddleware);
  return { app, gameRepo, puzzleRepo, settingsRepo, clock, scheduler };
}

function addFinishedGame(gameRepo, overrides = {}) {
  const id = `g-${Math.random().toString(36).slice(2)}`;
  gameRepo.save({
    id,
    status: 'finished',
    result: 'win',
    termination: 'checkmate',
    opponentId: 'maia-1100',
    opponentElo: 1100,
    playerColor: 'white',
    ranked: true,
    accuracy: 85,
    opponentAccuracy: 72,
    startedAt: NOW - 60_000,
    playedAt: NOW,
    ...overrides,
  });
  return id;
}

function addPuzzle(puzzleRepo, overrides = {}) {
  const id = `p-${Math.random().toString(36).slice(2)}`;
  puzzleRepo.save({
    id,
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    sideToMove: 'b',
    bestMoveUci: 'e7e5',
    bestMoveSan: 'e5',
    playedMoveSan: 'Nf6',
    acceptedMovesJson: '["e7e5"]',
    winLossPts: 22,
    classification: 'blunder',
    findability: 0.12,
    phase: 'opening',
    tags: '',
    pv: 'e7e5 d2d4',
    followupUci: 'd2d4',
    sourceGameId: null,
    sourcePly: 2,
    ...overrides,
  });
  return id;
}

// ─── GET /api/opponents ───────────────────────────────────────────────────────

describe('GET /api/opponents', () => {
  it('returns 200 with a non-empty opponents array', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/opponents');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.opponents)).toBe(true);
    expect(res.body.opponents.length).toBeGreaterThan(0);
  });

  it('each opponent has an id field', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/opponents');
    for (const opp of res.body.opponents) {
      expect(opp).toHaveProperty('id');
    }
  });
});

// ─── GET /api/state ───────────────────────────────────────────────────────────

describe('GET /api/state', () => {
  it('returns 200 with status ok', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/state');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('uses elo from settingsRepo or defaults to 1200', async () => {
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1450');
    const { app } = buildApp({ settingsRepo });
    const res = await request(app).get('/api/state');
    expect(res.body.elo).toBe(1450);
  });

  it('returns elo 1200 when no elo setting is stored', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/state');
    expect(res.body.elo).toBe(1200);
  });

  it('includes dueCount from puzzleRepo', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo);
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/state');
    expect(res.body.dueCount).toBe(1);
  });

  it('returns dueCount 0 when no due cards exist', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/state');
    expect(res.body.dueCount).toBe(0);
  });

  it('includes eloDelta of null when fewer than 2 elo history records', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/state');
    expect(res.body.eloDelta).toBeNull();
  });

  it('computes eloDelta from the last two elo history entries', async () => {
    const { app, gameRepo } = buildApp();
    gameRepo.updateElo('g1', { eloBefore: 1200, eloAfter: 1215, historyId: 'h1', recordedAt: NOW - 2000 });
    gameRepo.updateElo('g2', { eloBefore: 1215, eloAfter: 1230, historyId: 'h2', recordedAt: NOW - 1000 });
    const res = await request(app).get('/api/state');
    expect(res.body.eloDelta).toBe(15);
  });

  it('includes recentGames array', async () => {
    const { app, gameRepo } = buildApp();
    addFinishedGame(gameRepo);
    const res = await request(app).get('/api/state');
    expect(Array.isArray(res.body.recentGames)).toBe(true);
    expect(res.body.recentGames.length).toBe(1);
  });

  it('returns inProgressGameId when an in_progress game exists', async () => {
    const { app, gameRepo } = buildApp();
    const id = `g-inprog-${Date.now()}`;
    gameRepo.save({ id, status: 'in_progress', opponentId: 'maia-1100', startedAt: NOW });
    const res = await request(app).get('/api/state');
    expect(res.body.inProgressGameId).toBe(id);
  });

  it('returns suggestedOpponent from roster when opponents are available', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/state');
    expect(res.body.suggestedOpponent).not.toBeNull();
  });

  it('honours show_streak=0 setting by returning showStreak false', async () => {
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('show_streak', '0');
    const { app } = buildApp({ settingsRepo });
    const res = await request(app).get('/api/state');
    expect(res.body.showStreak).toBe(false);
  });
});

// ─── GET /api/stats ───────────────────────────────────────────────────────────

describe('GET /api/stats', () => {
  it('returns 200 with basic structure', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('elo');
    expect(res.body).toHaveProperty('dueCount');
    expect(res.body).toHaveProperty('wins');
    expect(res.body).toHaveProperty('losses');
    expect(res.body).toHaveProperty('draws');
  });

  it('counts wins, losses, draws from finished games', async () => {
    const { app, gameRepo } = buildApp();
    addFinishedGame(gameRepo, { result: 'win' });
    addFinishedGame(gameRepo, { result: 'loss' });
    addFinishedGame(gameRepo, { result: 'draw' });
    const res = await request(app).get('/api/stats');
    expect(res.body.wins).toBe(1);
    expect(res.body.losses).toBe(1);
    expect(res.body.draws).toBe(1);
  });

  it('excludes in_progress games from win/loss/draw counts', async () => {
    const { app, gameRepo } = buildApp();
    gameRepo.save({ id: 'g-ip', status: 'in_progress', opponentId: 'maia-1100', result: 'win' });
    const res = await request(app).get('/api/stats');
    expect(res.body.wins).toBe(0);
  });

  it('includes phase breakdown from puzzles', async () => {
    const { app, puzzleRepo } = buildApp();
    addPuzzle(puzzleRepo, { phase: 'opening' });
    addPuzzle(puzzleRepo, { fen: 'different-fen-1', phase: 'middlegame' });
    const res = await request(app).get('/api/stats');
    expect(res.body.phaseBreakdown.opening).toBe(1);
    expect(res.body.phaseBreakdown.middlegame).toBe(1);
  });

  it('returns eloDelta null when fewer than 2 elo history entries', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/stats');
    expect(res.body.eloDelta).toBeNull();
  });

  it('computes correct eloDelta from the two most recent elo history entries', async () => {
    const { app, gameRepo } = buildApp();
    gameRepo.updateElo('g1', { eloBefore: 1200, eloAfter: 1210, historyId: 'h1', recordedAt: NOW - 2000 });
    gameRepo.updateElo('g2', { eloBefore: 1210, eloAfter: 1225, historyId: 'h2', recordedAt: NOW - 1000 });
    const res = await request(app).get('/api/stats');
    expect(res.body.eloDelta).toBe(15);
  });

  it('counts active and graduated puzzles separately', async () => {
    const { app, puzzleRepo } = buildApp();
    const pid = addPuzzle(puzzleRepo);
    const pid2 = addPuzzle(puzzleRepo, { fen: 'different-fen-2' });
    puzzleRepo.saveCard({ puzzleId: pid, due: NOW + 86400000, graduated: true, reps: 6, lapses: 0 });
    puzzleRepo.saveCard({ puzzleId: pid2, due: NOW + 86400000, graduated: false, reps: 1, lapses: 0 });
    const res = await request(app).get('/api/stats');
    expect(res.body.graduatedCount).toBe(1);
    expect(res.body.activeCount).toBe(1);
  });

  it('includes motifAccuracy with correct/total per motif from drill reviews', async () => {
    const { app, puzzleRepo } = buildApp();
    const pid = addPuzzle(puzzleRepo, { motifTag: 'fork' });
    // Two drill reviews: first correct, second wrong
    puzzleRepo.saveReview({ puzzleId: pid, correct: true,  attemptNo: 1, practice: 0, reviewedAt: NOW });
    puzzleRepo.saveReview({ puzzleId: pid, correct: false, attemptNo: 1, practice: 0, reviewedAt: NOW });
    // Practice review should be excluded
    puzzleRepo.saveReview({ puzzleId: pid, correct: false, attemptNo: 1, practice: 1, reviewedAt: NOW });
    const res = await request(app).get('/api/stats');
    expect(res.body.motifAccuracy).toBeDefined();
    expect(res.body.motifAccuracy.fork).toEqual({ total: 2, correct: 1 });
  });

  it('includes motifAccuracy as empty object when no drill reviews exist', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/stats');
    expect(res.body.motifAccuracy).toEqual({});
  });

  it('includes focusMotif pointing to highest-priority motif', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    addFinishedGame(gameRepo);
    // fork: 5 mistakes, 80% accuracy → score 5*0.2=1.0
    // back_rank: 3 mistakes, no drill history → score 3*1.0=3.0 — wins
    const forkId = addPuzzle(puzzleRepo, { motifTag: 'fork' });
    addPuzzle(puzzleRepo, { fen: 'fen-a', motifTag: 'fork' });
    addPuzzle(puzzleRepo, { fen: 'fen-b', motifTag: 'fork' });
    addPuzzle(puzzleRepo, { fen: 'fen-c', motifTag: 'fork' });
    addPuzzle(puzzleRepo, { fen: 'fen-d', motifTag: 'fork' });
    addPuzzle(puzzleRepo, { fen: 'fen-e', motifTag: 'back_rank' });
    addPuzzle(puzzleRepo, { fen: 'fen-f', motifTag: 'back_rank' });
    addPuzzle(puzzleRepo, { fen: 'fen-g', motifTag: 'back_rank' });
    // Drill reviews for fork only (80% accuracy)
    for (let i = 0; i < 5; i++) {
      puzzleRepo.saveReview({ puzzleId: forkId, correct: i < 4, attemptNo: 1, practice: 0, reviewedAt: NOW });
    }
    const res = await request(app).get('/api/stats');
    expect(res.body.focusMotif).toBeDefined();
    expect(res.body.focusMotif.tag).toBe('back_rank');
    expect(res.body.focusMotif.accuracy).toBeNull();
  });

  it('includes focusMotif as null when no motif breakdown exists', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/stats');
    expect(res.body.focusMotif).toBeNull();
  });
});

// ─── GET /api/games ───────────────────────────────────────────────────────────

describe('GET /api/games', () => {
  it('returns 200 with a games array', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.games)).toBe(true);
  });

  it('includes puzzleCount per game', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, { sourceGameId: gameId });
    const res = await request(app).get('/api/games');
    const game = res.body.games.find(g => g.id === gameId);
    expect(game).toBeDefined();
    expect(game.puzzleCount).toBe(1);
  });

  it('returns empty array when no games exist', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/games');
    expect(res.body.games).toHaveLength(0);
  });
});

// ─── GET /api/games/:id/review ────────────────────────────────────────────────

describe('GET /api/games/:id/review', () => {
  it('returns 200 with review data for an existing game', async () => {
    const { app, gameRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    const res = await request(app).get(`/api/games/${gameId}/review`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', gameId);
    expect(Array.isArray(res.body.moves)).toBe(true);
    expect(Array.isArray(res.body.mistakes)).toBe(true);
  });

  it('returns 404 for an unknown game id', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/games/does-not-exist/review');
    expect(res.status).toBe(404);
    expect(res.body.error_code).toBe('game_not_found');
  });

  it('includes puzzle mistakes from puzzleRepo', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, { sourceGameId: gameId, tags: 'common_trap' });
    const res = await request(app).get(`/api/games/${gameId}/review`);
    expect(res.body.puzzleCount).toBe(1);
    const mistake = res.body.mistakes[0];
    expect(mistake.tags).toContain('common_trap');
  });

  it('includes engineOnly flag for engine_only-tagged puzzles', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, { sourceGameId: gameId, tags: 'engine_only' });
    const res = await request(app).get(`/api/games/${gameId}/review`);
    const mistake = res.body.mistakes[0];
    expect(mistake.engineOnly).toBe(true);
  });

  it('includes motifExplanation as a string when motifTag and playedMoveUci are present', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    // Nf3-g5: knight moves to g5, attacked by h6-pawn — hanging_piece fires
    addPuzzle(puzzleRepo, {
      sourceGameId: gameId,
      fen: '4k3/8/7p/8/8/5N2/8/4K3 w - - 0 1',
      sideToMove: 'white',
      playedMoveUci: 'f3g5',
      motifTag: 'hanging_piece',
    });
    const res = await request(app).get(`/api/games/${gameId}/review`);
    const mistake = res.body.mistakes[0];
    expect(mistake.motifExplanation).toBeTypeOf('string');
    expect(mistake.motifExplanation.length).toBeGreaterThan(10);
  });

  it('includes motifExplanation as null when motifTag is null', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, { sourceGameId: gameId, motifTag: null });
    const res = await request(app).get(`/api/games/${gameId}/review`);
    const mistake = res.body.mistakes[0];
    expect(mistake.motifExplanation).toBeNull();
  });
});

// ─── strength fields on review and games-list routes ─────────────────────────

describe('routes: GET /api/games exposes both strength estimates', () => {
  it('exposes strengthElo and opponentStrengthElo on the games list', async () => {
    const { app, gameRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo, { strengthElo: 1425, opponentStrengthElo: 1830 });
    const res = await request(app).get('/api/games');
    const game = res.body.games.find(g => g.id === gameId);
    expect(game).toBeDefined();
    expect(game.strengthElo).toBe(1425);
    expect(game.opponentStrengthElo).toBe(1830);
  });

  it('exposes null strength when not set (not zero, not undefined)', async () => {
    const { app, gameRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    const res = await request(app).get('/api/games');
    const game = res.body.games.find(g => g.id === gameId);
    expect(game.strengthElo).toBeNull();
    expect(game.opponentStrengthElo).toBeNull();
  });
});

describe('routes: GET /api/games/:id/review — strength fields', () => {
  it('exposes both estimates, their SEs and the rolling aggregate', async () => {
    const { app, gameRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo, { strengthElo: 1450, opponentStrengthElo: 1800 });
    // Store sufficient-stats sample so SE can be computed
    gameRepo.saveStrengthSample({ gameId, side: 'player', n: 20, ase: 0.15, sd: 0.08, p75Loss: 40, wasTimed: false, coeffVersion: 1 });
    gameRepo.saveStrengthSample({ gameId, side: 'opponent', n: 18, ase: 0.20, sd: 0.10, p75Loss: 50, wasTimed: false, coeffVersion: 1 });
    const res = await request(app).get(`/api/games/${gameId}/review`);
    expect(res.status).toBe(200);
    expect(res.body.strengthElo).toBe(1450);
    expect(res.body.opponentStrengthElo).toBe(1800);
    expect(typeof res.body.strengthSe).toBe('number');
    expect(typeof res.body.opponentStrengthSe).toBe('number');
    expect(typeof res.body.rollingStrength).toBe('number');
    expect(typeof res.body.rollingSe).toBe('number');
  });

  it('a game with no estimate exposes null, not zero', async () => {
    const { app, gameRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    const res = await request(app).get(`/api/games/${gameId}/review`);
    expect(res.body.strengthElo).toBeNull();
    expect(res.body.opponentStrengthElo).toBeNull();
    expect(res.body.strengthSe).toBeNull();
    expect(res.body.opponentStrengthSe).toBeNull();
  });

  it('the review SE equals ELO_PER_ASE * sd / sqrt(n) from the stored sample', async () => {
    const { app, gameRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo, { strengthElo: 1450 });
    gameRepo.saveStrengthSample({ gameId, side: 'player', n: 25, ase: 0.15, sd: 0.09, p75Loss: null, wasTimed: false, coeffVersion: 1 });
    const res = await request(app).get(`/api/games/${gameId}/review`);
    const { STRENGTH_ELO_PER_ASE: RATE } = await import('../../src/shared/balance.js');
    const expected = Math.round(RATE * 0.09 / Math.sqrt(25));
    expect(res.body.strengthSe).toBe(expected);
  });

  it('the rolling aggregate is null when no game has enough eligible plies', async () => {
    const { app, gameRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    // Store a sample with n=1 (below STRENGTH_MIN_PLIES)
    gameRepo.saveStrengthSample({ gameId, side: 'player', n: 1, ase: 0.15, sd: 0, p75Loss: null, wasTimed: false, coeffVersion: 1 });
    const res = await request(app).get(`/api/games/${gameId}/review`);
    expect(res.body.rollingStrength).toBeNull();
    expect(res.body.rollingSe).toBeNull();
  });

  it('the rolling aggregate is inverse-variance weighted, not a plain mean', async () => {
    const { app, gameRepo } = buildApp();
    const { STRENGTH_ANCHOR_ELO: AEL, STRENGTH_ANCHOR_ASE: AAS } = await import('../../src/shared/balance.js');
    // Two games: same ase (same point estimate) but different se (different weights)
    const g1 = addFinishedGame(gameRepo, { startedAt: NOW - 2000 });
    const g2 = addFinishedGame(gameRepo, { startedAt: NOW - 1000 });
    // n=100 → small se → heavy weight; n=12 → large se → light weight
    gameRepo.saveStrengthSample({ gameId: g1, side: 'player', n: 100, ase: AAS, sd: 0.09, p75Loss: null, wasTimed: false, coeffVersion: 1 });
    gameRepo.saveStrengthSample({ gameId: g2, side: 'player', n: 12, ase: AAS, sd: 0.09, p75Loss: null, wasTimed: false, coeffVersion: 1 });
    const res = await request(app).get(`/api/games/${g2}/review`);
    // Both have ase = AAS so point estimate = ANCHOR_ELO. Rolling should be ~ANCHOR_ELO.
    expect(res.body.rollingStrength).toBeCloseTo(AEL, -1); // within 5 Elo
  });
});

// ─── GET /api/games/:id/quiz ──────────────────────────────────────────────────

describe('GET /api/games/:id/quiz', () => {
  it('returns 200 with positions array for a known game', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, { sourceGameId: gameId });
    const res = await request(app).get(`/api/games/${gameId}/quiz`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.positions)).toBe(true);
    expect(res.body.positions.length).toBe(1);
  });

  it('excludes engine_only puzzles from quiz positions', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, { sourceGameId: gameId, tags: 'engine_only', fen: 'fen-a' });
    addPuzzle(puzzleRepo, { sourceGameId: gameId, tags: '', fen: 'fen-b' });
    const res = await request(app).get(`/api/games/${gameId}/quiz`);
    expect(res.body.positions.length).toBe(1);
  });

  it('returns 404 for an unknown game id', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/games/no-such-game/quiz');
    expect(res.status).toBe(404);
  });

  it('sorts positions by source_ply ascending', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, { sourceGameId: gameId, sourcePly: 20, fen: 'fen-late' });
    addPuzzle(puzzleRepo, { sourceGameId: gameId, sourcePly: 4, fen: 'fen-early' });
    const res = await request(app).get(`/api/games/${gameId}/quiz`);
    const plies = res.body.positions.map(p => p.ply);
    expect(plies[0]).toBeLessThan(plies[1]);
  });
});

// ─── POST /api/games/:id/analyse ─────────────────────────────────────────────

describe('POST /api/games/:id/analyse', () => {
  it('returns 202 when engine pool is available and game is finished', async () => {
    const fakePool = {
      getAnalysisSfClient: async () => ({
        eval: async () => ({ bestmove: 'e2e4', cp: 20, pv: 'e2e4', mate: null }),
        setOption: () => {},
      }),
      getMaiaAnalysisClient: async () => ({
        policy: async () => new Map([['e2e4', 0.5]]),
        eval: async () => ({ bestmove: 'e2e4' }),
      }),
    };
    const { app, gameRepo } = buildApp({ enginePool: fakePool });
    const gameId = addFinishedGame(gameRepo, { result: 'win', termination: 'checkmate', ranked: true });
    const res = await request(app).post(`/api/games/${gameId}/analyse`);
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });

  it('returns 409 when game is not finished', async () => {
    const fakePool = { getAnalysisSfClient: async () => ({}) };
    const { app, gameRepo } = buildApp({ enginePool: fakePool });
    const id = `g-ip2-${Date.now()}`;
    gameRepo.save({ id, status: 'in_progress', opponentId: 'maia-1100', playerColor: 'white', ranked: false });
    const res = await request(app).post(`/api/games/${id}/analyse`);
    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('game_not_finished');
  });

  it('returns 503 when enginePool is not provided', async () => {
    const { app, gameRepo } = buildApp({ enginePool: undefined });
    const gameId = addFinishedGame(gameRepo);
    const res = await request(app).post(`/api/games/${gameId}/analyse`);
    expect(res.status).toBe(503);
    expect(res.body.error_code).toBe('engine_unavailable');
  });

  it('returns 404 for an unknown game id', async () => {
    const { app } = buildApp({ enginePool: {} });
    const res = await request(app).post('/api/games/nonexistent/analyse');
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/puzzles/due ─────────────────────────────────────────────────────

describe('GET /api/puzzles/due', () => {
  it('returns 200 with cards and total', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/puzzles/due');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.cards)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });

  it('returns due cards that are past their due time', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo);
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.body.total).toBe(1);
    expect(res.body.cards.length).toBe(1);
    expect(res.body.cards[0].puzzleId).toBe(puzzleId);
  });

  it('does not return cards not yet due', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo);
    puzzleRepo.saveCard({ puzzleId, due: NOW + 86400000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.body.total).toBe(0);
    expect(res.body.cards).toHaveLength(0);
  });

  it('does not return graduated cards', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo);
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: true, reps: 8, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.body.total).toBe(0);
  });

  it('each card has a puzzleId field', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo);
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.body.cards[0]).toHaveProperty('puzzleId');
  });

  it('includes motifExplanation as a string when motifTag and playedMoveUci are present', async () => {
    const { app, puzzleRepo } = buildApp();
    // hanging_piece: Nf3-g5 lands on attacked, undefended square
    const puzzleId = addPuzzle(puzzleRepo, {
      fen: '4k3/8/7p/8/8/5N2/8/4K3 w - - 0 1',
      sideToMove: 'white',
      playedMoveUci: 'f3g5',
      motifTag: 'hanging_piece',
    });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.body.cards[0].motifExplanation).toBeTypeOf('string');
    expect(res.body.cards[0].motifExplanation.length).toBeGreaterThan(10);
  });

  it('includes motifExplanation as null when no motifTag is present', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, { motifTag: null });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.body.cards[0].motifExplanation).toBeNull();
  });

  it('?motif= filter returns only cards with the specified motif tag', async () => {
    const { app, puzzleRepo } = buildApp();
    const forkId = addPuzzle(puzzleRepo, { motifTag: 'fork' });
    const hangId = addPuzzle(puzzleRepo, { motifTag: 'hanging_piece', fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1' });
    puzzleRepo.saveCard({ puzzleId: forkId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    puzzleRepo.saveCard({ puzzleId: hangId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due?motif=fork');
    expect(res.body.cards.every(c => c.motifTag === 'fork')).toBe(true);
    expect(res.body.cards.length).toBe(1);
  });

  it('?motif= filter returns all cards when motif param is absent', async () => {
    const { app, puzzleRepo } = buildApp();
    const forkId = addPuzzle(puzzleRepo, { motifTag: 'fork' });
    const hangId = addPuzzle(puzzleRepo, { motifTag: 'hanging_piece', fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1' });
    puzzleRepo.saveCard({ puzzleId: forkId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    puzzleRepo.saveCard({ puzzleId: hangId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.body.cards.length).toBe(2);
  });
});

// ─── GET /api/puzzles/practice ────────────────────────────────────────────────

describe('GET /api/puzzles/practice', () => {
  it('returns 200 with cards and total', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/puzzles/practice');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.cards)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });
});

// ─── POST /api/puzzles/:id/attempt ────────────────────────────────────────────

describe('POST /api/puzzles/:id/attempt', () => {
  it('returns 200 with a correct verdict for the best move', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, { acceptedMovesJson: '["e7e5"]', followupUci: null });
    // save a card with reps>0 so isFirstSpacedReview is false, and use msTaken between 6s and 25s → Good
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 1, lapses: 0 });
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 10000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
    expect(res.body.rating).toBe('Good');
  });

  it('returns incorrect verdict for a wrong move', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, { acceptedMovesJson: '["e7e5"]', followupUci: null });
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e6', msTaken: 5000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
    expect(res.body.rating).toBe('Again');
  });

  it('infers Easy for a correct first attempt under 6 s (first spaced review, reps=0)', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, { acceptedMovesJson: '["e7e5"]', followupUci: null });
    // No card saved yet → reps===0 → isFirstSpacedReview===true
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 1000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.body.correct).toBe(true);
    expect(res.body.rating).toBe('Easy');
  });

  it('infers Hard for a correct attempt over 25 s', async () => {
    const { app, puzzleRepo, scheduler } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, { acceptedMovesJson: '["e7e5"]', followupUci: null });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 1, lapses: 0 }); // reps>0 → not first
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 30000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.body.correct).toBe(true);
    expect(res.body.rating).toBe('Hard');
    expect(scheduler.calls.length).toBe(1);
  });

  it('does not schedule when phase is quiz (practice=1)', async () => {
    const { app, puzzleRepo, scheduler } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, { acceptedMovesJson: '["e7e5"]', followupUci: null });
    await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 5000, hintUsed: false, attemptNo: 1, phase: 'quiz' });
    expect(scheduler.calls.length).toBe(0);
  });

  it('creates a card due tomorrow for a quiz attempt when no card exists yet', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, { acceptedMovesJson: '["e7e5"]', followupUci: null });
    await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 5000, hintUsed: false, attemptNo: 1, phase: 'quiz' });
    const card = puzzleRepo.getCard(puzzleId);
    expect(card).not.toBeNull();
    expect(card.due).toBeGreaterThan(NOW);
  });

  it('returns 400 for an invalid move format', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo);
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'invalid', msTaken: 1000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('validation_failed');
  });

  it('returns 404 for an unknown puzzle id', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/puzzles/no-such-puzzle/attempt')
      .send({ move: 'e7e5', msTaken: 1000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(404);
  });

  it('followupRequired is true when puzzle has a followupUci', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, {
      acceptedMovesJson: '["e7e5"]',
      followupUci: 'd2d4',
    });
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 5000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.body.followupRequired).toBe(true);
  });

  it('hint forces Again rating', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, { acceptedMovesJson: '["e7e5"]', followupUci: null });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 1, lapses: 0 });
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 3000, hintUsed: true, attemptNo: 1, phase: 'drill' });
    expect(res.body.rating).toBe('Again');
  });
});

// ─── GET /api/games error path ───────────────────────────────────────────────

describe('GET /api/games error path', () => {
  it('returns 500 when listRecent throws', async () => {
    const gameRepo = new InMemoryGameRepository();
    gameRepo.listRecent = () => { throw new Error('db down'); };
    const { app } = buildApp({ gameRepo });
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/games/:id/quiz — null fen pieceAtSquare branches ───────────────

describe('GET /api/games/:id/quiz - null fen covers ?? branches (games.js 153,155,162)', () => {
  it('returns ? for piece and null for acceptedMovesJson when puzzle has no fen or uci', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    // puzzle with no fen, no bestMoveUci, no acceptedMovesJson — all ?? branches fire
    addPuzzle(puzzleRepo, {
      sourceGameId: gameId,
      fen: null,
      bestMoveUci: null,
      acceptedMovesJson: null,
      tags: '',
    });
    const res = await request(app).get(`/api/games/${gameId}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions[0].piece).toBe('?');
    expect(res.body.positions[0].acceptedMovesJson).toBeNull();
  });
});

// ─── GET /api/games/:id/quiz — pieceAtSquare branches ────────────────────────

describe('GET /api/games/:id/quiz - pieceAtSquare branches', () => {
  it('returns Pawn when FEN requires digit traversal to reach the piece (line 173)', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    // e4 square is on row '4P3' — ch='4' (digit) traversal before finding 'P'
    addPuzzle(puzzleRepo, {
      sourceGameId: gameId,
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      bestMoveUci: 'e4e5',
    });
    const res = await request(app).get(`/api/games/${gameId}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions[0].piece).toBe('Pawn');
  });

  it('returns ? when the target square is on an empty rank (line 179)', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    // e6 is on row '8' (all empty) — col exhausted, falls through to return '?'
    addPuzzle(puzzleRepo, {
      sourceGameId: gameId,
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      bestMoveUci: 'e6e5',
    });
    const res = await request(app).get(`/api/games/${gameId}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions[0].piece).toBe('?');
  });
});

// ─── GET /api/puzzles/due — error + pieceAtSquare branches ───────────────────

describe('GET /api/puzzles/due - error path', () => {
  it('returns 500 when getDueCards throws', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    puzzleRepo.getDueCards = () => { throw new Error('db error'); };
    const { app } = buildApp({ puzzleRepo });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.status).toBe(500);
  });

  it('formatCard covers digit-traversal pieceAtSquare path (puzzles.js line 176)', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, {
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      bestMoveUci: 'e4e5',
    });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.status).toBe(200);
    expect(res.body.cards[0].piece).toBe('Pawn');
  });

  it('formatCard returns ? when puzzle has no fen (puzzles.js 157,165)', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, { fen: null, bestMoveUci: null });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.status).toBe(200);
    expect(res.body.cards[0].piece).toBe('?');
  });

  it('formatCard returns ? for empty-rank pieceAtSquare path (puzzles.js line 182)', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, {
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      bestMoveUci: 'e6e5',
    });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.status).toBe(200);
    expect(res.body.cards[0].piece).toBe('?');
  });
});

// ─── GET /api/puzzles/practice — error path ───────────────────────────────────

describe('GET /api/puzzles/practice - error path', () => {
  it('returns 500 when getPracticeCards throws', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    puzzleRepo.getPracticeCards = () => { throw new Error('db error'); };
    const { app } = buildApp({ puzzleRepo });
    const res = await request(app).get('/api/puzzles/practice');
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/puzzles/:id/attempt — saveReview error path ───────────────────

describe('POST /api/puzzles/:id/attempt - saveReview error path', () => {
  it('still returns verdict when saveReview throws (puzzles.js line 122)', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const puzzleId = addPuzzle(puzzleRepo, { acceptedMovesJson: '["e7e5"]', followupUci: null });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 1, lapses: 0 });
    puzzleRepo.saveReview = () => { throw new Error('review save failed'); };
    const { app } = buildApp({ puzzleRepo });
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 10000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
  });
});

// ─── GET /api/stats — additional branch coverage ─────────────────────────────

describe('GET /api/stats - additional branch coverage', () => {
  it('populates qualityMix when getPlayerMoveClassifications returns data (line 68)', async () => {
    const gameRepo = new InMemoryGameRepository();
    // Two entries with same classification cover both branches of (qualityMix[x] || 0)
    gameRepo.getPlayerMoveClassifications = () => [
      { classification: 'blunder', played_at: NOW },
      { classification: 'blunder', played_at: NOW },
    ];
    const { app } = buildApp({ gameRepo });
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.qualityMix.blunder).toBe(2);
  });

  it('returns 500 when getEloHistory throws (stats.js line 92)', async () => {
    const gameRepo = new InMemoryGameRepository();
    gameRepo.getEloHistory = () => { throw new Error('elo history db error'); };
    const { app } = buildApp({ gameRepo });
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(500);
  });

  it('covers line 39 FALSE: finished game with result not in {win,loss,draw}', async () => {
    const gameRepo = new InMemoryGameRepository();
    addFinishedGame(gameRepo, { result: 'win' });
    addFinishedGame(gameRepo, { result: 'loss' });
    addFinishedGame(gameRepo, { result: 'draw' });
    // result=null covers the else-if chain FALSE branch on line 39
    addFinishedGame(gameRepo, { result: null });
    const { app } = buildApp({ gameRepo });
    const res = await request(app).get('/api/stats');
    expect(res.body.wins).toBe(1);
    expect(res.body.losses).toBe(1);
    expect(res.body.draws).toBe(1);
  });

  it('covers line 43 FALSE: puzzleRepo without listAll returns empty array', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    delete puzzleRepo.listAll; // remove listAll to hit the : [] branch
    const { app } = buildApp({ puzzleRepo });
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.activeCount).toBe(0);
  });

  it('covers line 48 FALSE: puzzle with no phase skips phaseBreakdown increment', async () => {
    const { app, puzzleRepo } = buildApp();
    addPuzzle(puzzleRepo, { phase: null });
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    // phase=null → phaseBreakdown stays at 0 for all phases
    expect(res.body.phaseBreakdown.opening).toBe(0);
  });

  it('covers line 61 ?? chain: puzzle with no created_at or createdAt yields null', async () => {
    const { app, puzzleRepo } = buildApp();
    const pid = `p-nocreatedat-${Date.now()}`;
    // save directly without createdAt so it stays undefined (save() sets createdAt = Date.now(),
    // but we override by saving a puzzle without those fields via a custom puzzleRepo call)
    puzzleRepo._puzzles.set(pid, { id: pid, fen: `fen-null-ts-${pid}`, phase: 'opening' });
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    const entry = res.body.mistakesByPhase.find(p => p.phase === 'opening');
    expect(entry).toBeDefined();
  });

  it('covers line 65 ?? []: gameRepo without getPlayerMoveClassifications returns empty', async () => {
    const gameRepo = new InMemoryGameRepository();
    delete gameRepo.getPlayerMoveClassifications;
    const { app } = buildApp({ gameRepo });
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.allMoves).toHaveLength(0);
  });

  it('uses real getPlayerMoveClassifications sort (repositories.js line 150)', async () => {
    const gameRepo = new InMemoryGameRepository();
    const gid = 'g-mc-real';
    gameRepo.save({ id: gid, status: 'finished', result: 'win', playedAt: NOW });
    // saveMoveEval with mover=player and classification to populate _evals
    gameRepo.saveMoveEval({ gameId: gid, ply: 2, mover: 'player', classification: 'blunder',
      cpWhite: -200, mateIn: null, bestMoveUci: 'e2e4', pv: 'e2e4', winBefore: 60, winAfter: 30 });
    gameRepo.saveMoveEval({ gameId: gid, ply: 4, mover: 'player', classification: 'mistake',
      cpWhite: -100, mateIn: null, bestMoveUci: 'd2d4', pv: 'd2d4', winBefore: 50, winAfter: 35 });
    const { app } = buildApp({ gameRepo });
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.qualityMix.blunder).toBe(1);
    expect(res.body.qualityMix.mistake).toBe(1);
  });
});

// ─── InMemoryPuzzleRepository — direct coverage ──────────────────────────────

describe('InMemoryPuzzleRepository direct branch coverage', () => {
  it('saveReviewAndCard saves both review and card (repositories.js line 222)', () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const puzzleId = addPuzzle(puzzleRepo);
    puzzleRepo.saveReviewAndCard(
      { puzzleId, correct: true, rating: 'Good', msTaken: 5000, attemptNo: 1, practice: 0 },
      { puzzleId, due: NOW + 86400000, graduated: false, reps: 1, lapses: 0 },
    );
    const card = puzzleRepo.getCard(puzzleId);
    expect(card).not.toBeNull();
    expect(card.reps).toBe(1);
  });

  it('listByGame sorts puzzles with undefined sourcePly using ?? 0 fallback (line 210)', () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const gid = 'game-sort-test';
    // 3 items: 2 without sourcePly, 1 with — forces sort to compare (defined,undef) AND (undef,defined)
    puzzleRepo.save({ id: 'sort-p1', fen: 'fen-sort-1', sourceGameId: gid });          // no sourcePly
    puzzleRepo.save({ id: 'sort-p2', fen: 'fen-sort-2', sourceGameId: gid, sourcePly: 5 });
    puzzleRepo.save({ id: 'sort-p3', fen: 'fen-sort-3', sourceGameId: gid });          // no sourcePly
    const result = puzzleRepo.listByGame(gid);
    expect(result).toHaveLength(3);
    // undefined sourcePly treated as 0 → both sort-p1 and sort-p3 come before sort-p2
    expect(result[result.length - 1].id).toBe('sort-p2');
  });

  it('getPracticeCards sorts by instructiveness with undefined using ?? 0 fallback (line 238)', () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    // 3 items: 2 without instructiveness, 1 with — forces (defined,undef) AND (undef,defined) comparisons
    puzzleRepo.save({ id: 'prac-p1', fen: 'fen-prac-1', sourceGameId: null });           // no instructiveness
    puzzleRepo.save({ id: 'prac-p2', fen: 'fen-prac-2', sourceGameId: null, instructiveness: 3.0 });
    puzzleRepo.save({ id: 'prac-p3', fen: 'fen-prac-3', sourceGameId: null });           // no instructiveness
    puzzleRepo.saveCard({ puzzleId: 'prac-p1', due: NOW + 3600000, graduated: false, reps: 0, lapses: 0 });
    puzzleRepo.saveCard({ puzzleId: 'prac-p2', due: NOW + 3600000, graduated: false, reps: 0, lapses: 0 });
    puzzleRepo.saveCard({ puzzleId: 'prac-p3', due: NOW + 3600000, graduated: false, reps: 0, lapses: 0 });
    const result = puzzleRepo.getPracticeCards(NOW);
    expect(result).toHaveLength(3);
    // instructiveness=3.0 sorts first (descending); undefined treated as 0 → comes after
    expect(result[0].id).toBe('prac-p2');
  });
});

// ─── InMemoryGameRepository.getPlayerMoveClassifications branch coverage ────────

describe('InMemoryGameRepository.getPlayerMoveClassifications direct branch coverage', () => {
  it('skips eval whose game does not exist in _games (line 143 !game TRUE)', () => {
    const gameRepo = new InMemoryGameRepository();
    // Save a move eval for a gameId that has no corresponding game row
    gameRepo.saveMoveEval({
      gameId: 'nonexistent-game',
      ply: 2, mover: 'player', classification: 'blunder',
      cpWhite: -200, mateIn: null, bestMoveUci: 'e2e4', pv: 'e2e4',
      winBefore: 60, winAfter: 30,
    });
    const result = gameRepo.getPlayerMoveClassifications();
    // No game row → skipped → empty result
    expect(result).toHaveLength(0);
  });

  it('skips eval whose game is not finished (line 143 status !== finished TRUE)', () => {
    const gameRepo = new InMemoryGameRepository();
    const gid = 'g-inprogress';
    // Game exists but is still in_progress
    gameRepo.save({ id: gid, status: 'in_progress', opponentId: 'maia-1100' });
    gameRepo.saveMoveEval({
      gameId: gid, ply: 2, mover: 'player', classification: 'blunder',
      cpWhite: -200, mateIn: null, bestMoveUci: 'e2e4', pv: 'e2e4',
      winBefore: 60, winAfter: 30,
    });
    const result = gameRepo.getPlayerMoveClassifications();
    // Game not finished → skipped → empty result
    expect(result).toHaveLength(0);
  });

  it('skips opponent evals (line 145 mover !== player FALSE)', () => {
    const gameRepo = new InMemoryGameRepository();
    const gid = 'g-opponent-eval';
    gameRepo.save({ id: gid, status: 'finished', result: 'win', playedAt: 1000 });
    gameRepo.saveMoveEval({
      gameId: gid, ply: 1, mover: 'opponent', classification: 'mistake',
      cpWhite: -100, mateIn: null, bestMoveUci: 'e2e4', pv: 'e2e4',
      winBefore: 50, winAfter: 40,
    });
    const result = gameRepo.getPlayerMoveClassifications();
    // Opponent eval → skipped
    expect(result).toHaveLength(0);
  });

  it('skips evals with null classification (line 145 classification != null FALSE)', () => {
    const gameRepo = new InMemoryGameRepository();
    const gid = 'g-null-classif';
    gameRepo.save({ id: gid, status: 'finished', result: 'win', playedAt: 1000 });
    gameRepo.saveMoveEval({
      gameId: gid, ply: 2, mover: 'player', classification: null,
      cpWhite: 0, mateIn: null, bestMoveUci: 'e2e4', pv: 'e2e4',
      winBefore: 50, winAfter: 50,
    });
    const result = gameRepo.getPlayerMoveClassifications();
    // Null classification → skipped
    expect(result).toHaveLength(0);
  });

  it('covers game.playedAt ?? 0 right side: game without playedAt sets played_at to 0', () => {
    const gameRepo = new InMemoryGameRepository();
    const gid = 'g-no-playedat';
    // Save game without playedAt so game.playedAt is undefined → ?? 0 fires
    gameRepo.save({ id: gid, status: 'finished', result: 'win' });
    gameRepo.saveMoveEval({
      gameId: gid, ply: 2, mover: 'player', classification: 'blunder',
      cpWhite: -200, mateIn: null, bestMoveUci: 'e2e4', pv: 'e2e4',
      winBefore: 60, winAfter: 30,
    });
    const result = gameRepo.getPlayerMoveClassifications();
    expect(result).toHaveLength(1);
    expect(result[0].played_at).toBe(0);
  });

  it('saveReview twice: second call hits FALSE branch of if (!this._reviews) (line 222)', () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const pid = addPuzzle(puzzleRepo);
    puzzleRepo.saveReview({ puzzleId: pid, correct: true, msTaken: 3000, attemptNo: 1, practice: 0 });
    puzzleRepo.saveReview({ puzzleId: pid, correct: false, msTaken: 5000, attemptNo: 2, practice: 0 });
    // Both reviews stored — second call took the FALSE branch
    const reviews = puzzleRepo._reviews;
    expect(reviews).toHaveLength(2);
  });
});

// ─── POST /api/debug/reset ────────────────────────────────────────────────────

describe('POST /api/debug/reset', () => {
  it('abandons all in_progress games and returns ok', async () => {
    const { app, gameRepo } = buildApp();
    const id = `g-ip3-${Date.now()}`;
    gameRepo.save({ id, status: 'in_progress', opponentId: 'maia-1100' });
    const res = await request(app).post('/api/debug/reset');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const game = gameRepo.findById(id);
    expect(game.status).toBe('abandoned');
  });

  it('returns ok even when no in_progress games exist', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/api/debug/reset');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── GET /api/state — inner and outer catch branches ─────────────────────────

describe('GET /api/state — catch branch coverage', () => {
  it('inner catch: streak falls back to 0 when streak_cache.get throws (state.js line 34-35)', async () => {
    const settingsRepo = new InMemorySettingsRepository();
    const origGet = settingsRepo.get.bind(settingsRepo);
    settingsRepo.get = (key) => {
      if (key === 'streak_cache') throw new Error('db error on streak_cache');
      return origGet(key);
    };
    const { app } = buildApp({ settingsRepo });
    const res = await request(app).get('/api/state');
    expect(res.status).toBe(200);
    expect(res.body.streak).toBe(0);
  });

  it('outer catch: returns 500 when settingsRepo.get("elo") throws (state.js line 85-86)', async () => {
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.get = () => { throw new Error('catastrophic db failure'); };
    const { app } = buildApp({ settingsRepo });
    const res = await request(app).get('/api/state');
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/games/:id/quiz — additional branch coverage ────────────────────

describe('GET /api/games/:id/quiz — additional branch coverage', () => {
  it('non-string tags (null) takes [] branch in filter (games.js line 100 FALSE)', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, { sourceGameId: gameId, tags: null });
    const res = await request(app).get(`/api/games/${gameId}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions.length).toBe(1);
  });

  it('null pv fires ?? null in formatQuizPosition (games.js line 151)', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, { sourceGameId: gameId, pv: null });
    const res = await request(app).get(`/api/games/${gameId}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions[0].pv).toBeNull();
  });

  it('null followupUci fires both ?? null right sides in formatQuizPosition (games.js line 152)', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, { sourceGameId: gameId, followupUci: null });
    const res = await request(app).get(`/api/games/${gameId}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions[0].followupUci).toBeNull();
  });

  it('rank > 8 fires rowIdx<0 branch in pieceAtSquare (games.js line 168)', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, {
      sourceGameId: gameId,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      bestMoveUci: 'a9b7',
    });
    const res = await request(app).get(`/api/games/${gameId}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions[0].piece).toBe('?');
  });

  it('unknown FEN piece char fires ?? "?" in pieceAtSquare (games.js line 175)', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, {
      sourceGameId: gameId,
      fen: 'Xnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      bestMoveUci: 'a8b6',
    });
    const res = await request(app).get(`/api/games/${gameId}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions[0].piece).toBe('?');
  });
});

// ─── GET /api/puzzles/due + POST attempt — additional branch coverage ─────────

describe('GET /api/puzzles/due — additional branch coverage', () => {
  it('null followupUci fires ?? null right sides in formatCard (puzzles.js line 155)', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, { followupUci: null });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.status).toBe(200);
    expect(res.body.cards[0].followupUci).toBeNull();
  });

  it('rank > 8 fires rowIdx<0 branch in pieceAtSquare (puzzles.js line 171)', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, {
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      bestMoveUci: 'a9b7',
    });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.status).toBe(200);
    expect(res.body.cards[0].piece).toBe('?');
  });

  it('unknown FEN piece char fires ?? "?" in pieceAtSquare (puzzles.js line 178)', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, {
      fen: 'Xnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      bestMoveUci: 'a8b6',
    });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 0, lapses: 0 });
    const res = await request(app).get('/api/puzzles/due');
    expect(res.status).toBe(200);
    expect(res.body.cards[0].piece).toBe('?');
  });
});

describe('POST /api/puzzles/:id/attempt — null updatedCard branch', () => {
  it('nextDue is null when getCard returns null after scheduling (puzzles.js line 136)', async () => {
    const puzzleRepo = new InMemoryPuzzleRepository();
    const puzzleId = addPuzzle(puzzleRepo, { acceptedMovesJson: '["e7e5"]', followupUci: null });
    puzzleRepo.getCard = () => null;
    const { app } = buildApp({ puzzleRepo });
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 5000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
    expect(res.body.nextDue).toBeNull();
  });
});

// ─── GET /api/games — additional branch coverage ─────────────────────────────

describe('GET /api/games — additional branch coverage', () => {
  it('game with no puzzles fires ?? 0 right side for puzzleCount (games.js line 32)', async () => {
    const { app, gameRepo } = buildApp();
    addFinishedGame(gameRepo);
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(200);
    expect(res.body.games[0].puzzleCount).toBe(0);
  });

  it('puzzleRepo without getPuzzleCountsByGameId fires ?. FALSE and ?? {} (games.js line 30)', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    delete puzzleRepo.getPuzzleCountsByGameId;
    addFinishedGame(gameRepo);
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(200);
    expect(res.body.games[0].puzzleCount).toBe(0);
  });
});

// ─── GET /api/games/:id/review — eval mapping branch coverage ────────────────

describe('GET /api/games/:id/review — eval mapping branch coverage', () => {
  it('evals.map runs: win_after non-null fires ?? left sides (games.js lines 45-53)', async () => {
    const { app, gameRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    gameRepo.saveMoveEval({
      gameId, ply: 2,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      move_san: 'e4', move_uci: 'e2e4', mover: 'player',
      win_after: 55, win_before: 50, classification: 'blunder', cp_loss: 30,
    });
    const res = await request(app).get(`/api/games/${gameId}/review`);
    expect(res.status).toBe(200);
    expect(res.body.moves[0].winPct).toBe(55);
    expect(res.body.moves[0].classification).toBe('blunder');
    expect(res.body.moves[0].cpLoss).toBe(30);
  });

  it('null win_after and win_before fires ?? 50 right side; null fields fire ?? null (games.js lines 51-53)', async () => {
    const { app, gameRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    gameRepo.saveMoveEval({
      gameId, ply: 2,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      move_san: 'e4', move_uci: 'e2e4', mover: 'player',
      win_after: null, win_before: null, classification: null, cp_loss: null,
    });
    const res = await request(app).get(`/api/games/${gameId}/review`);
    expect(res.status).toBe(200);
    expect(res.body.moves[0].winPct).toBe(50);
    expect(res.body.moves[0].classification).toBeNull();
    expect(res.body.moves[0].cpLoss).toBeNull();
  });

  it('null win_after but non-null win_before fires middle ?? branch (games.js line 51)', async () => {
    const { app, gameRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    gameRepo.saveMoveEval({
      gameId, ply: 2,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      move_san: 'e4', move_uci: 'e2e4', mover: 'player',
      win_after: null, win_before: 48, classification: 'mistake', cp_loss: 15,
    });
    const res = await request(app).get(`/api/games/${gameId}/review`);
    expect(res.status).toBe(200);
    expect(res.body.moves[0].winPct).toBe(48);
  });

  it('puzzle with empty string tags fires FALSE branch of tag check (games.js line 57)', async () => {
    const { app, gameRepo, puzzleRepo } = buildApp();
    const gameId = addFinishedGame(gameRepo);
    addPuzzle(puzzleRepo, { sourceGameId: gameId, tags: '' });
    const res = await request(app).get(`/api/games/${gameId}/review`);
    expect(res.status).toBe(200);
    expect(res.body.mistakes[0].tags).toEqual([]);
  });
});

// ─── POST /api/puzzles/:id/attempt — additional branch coverage ───────────────

describe('POST /api/puzzles/:id/attempt — additional branch coverage', () => {
  it('puzzle missing bestMoveSan/pv/winLossPts fires ?? null right sides (puzzles.js lines 133-135)', async () => {
    const { app, puzzleRepo } = buildApp();
    const puzzleId = addPuzzle(puzzleRepo, { bestMoveSan: null, pv: null, winLossPts: null });
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 1, lapses: 0 });
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 5000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
    expect(res.body.bestMoveSan).toBeNull();
    expect(res.body.pv).toBeNull();
    expect(res.body.winLoss).toBeNull();
  });

  it('scheduler._nextDue set fires LEFT side of ?? due in FakeScheduler (fake-scheduler.js line 40)', async () => {
    const { app, puzzleRepo, scheduler } = buildApp();
    const fixedDue = new Date(NOW + 7 * 86_400_000);
    scheduler._nextDue = fixedDue;
    const puzzleId = addPuzzle(puzzleRepo);
    puzzleRepo.saveCard({ puzzleId, due: NOW - 1000, graduated: false, reps: 1, lapses: 0 });
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 5000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
    const card = puzzleRepo.getCard(puzzleId);
    expect(card.due).toEqual(fixedDue);
  });

  it('scheduler without newCard fires ?. FALSE and ?? {} right side (puzzles.js line 92)', async () => {
    const { app, puzzleRepo, scheduler } = buildApp();
    delete scheduler.newCard;
    const puzzleId = addPuzzle(puzzleRepo);
    const res = await request(app)
      .post(`/api/puzzles/${puzzleId}/attempt`)
      .send({ move: 'e7e5', msTaken: 5000, hintUsed: false, attemptNo: 1, phase: 'drill' });
    expect(res.status).toBe(200);
  });
});
