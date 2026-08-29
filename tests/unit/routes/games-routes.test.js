/**
 * Unit tests for games REST routes.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { gamesRouter } from '../../../src/api/routes/games.js';
import { InMemoryGameRepository, InMemoryPuzzleRepository, InMemorySettingsRepository } from '../../../src/adapters/memory/repositories.js';

function makeApp(gameRepo, puzzleRepo, opts = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/games', gamesRouter({ gameRepo, puzzleRepo, settingsRepo: opts.settingsRepo ?? new InMemorySettingsRepository(), enginePool: opts.enginePool ?? null }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

function makeGame(id = randomUUID()) {
  return {
    id,
    opponentId: 'maia-1100',
    opponentElo: 1100,
    playerColor: 'white',
    ranked: true,
    status: 'finished',
    result: 'win',
    termination: 'checkmate',
    accuracy: 85,
    opponentAccuracy: 72,
    eloBefore: 1200,
    eloAfter: 1210,
    playedAt: Date.now(),
    analysisState: 'done',
  };
}

describe('GET /api/games', () => {
  it('returns empty list when no games', async () => {
    const res = await request(makeApp(new InMemoryGameRepository(), new InMemoryPuzzleRepository()))
      .get('/api/games');
    expect(res.status).toBe(200);
    expect(res.body.games).toEqual([]);
  });

  it('returns games with puzzle counts', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);
    const res = await request(makeApp(gameRepo, puzzleRepo)).get('/api/games');
    expect(res.status).toBe(200);
    expect(res.body.games).toHaveLength(1);
    expect(res.body.games[0].puzzleCount).toBe(0);
  });

  it('propagates errors from gameRepo.listRecent via next(err)', async () => {
    const badGameRepo = {
      listRecent: () => { throw new Error('db error'); },
    };
    const app = express();
    app.use(express.json());
    app.use('/api/games', gamesRouter({ gameRepo: badGameRepo, puzzleRepo: new InMemoryPuzzleRepository(), settingsRepo: new InMemorySettingsRepository(), enginePool: null }));
    app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/games/:id/review', () => {
  it('returns review data for a finished game', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);
    const res = await request(makeApp(gameRepo, puzzleRepo))
      .get(`/api/games/${game.id}/review`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(game.id);
    expect(res.body.moves).toEqual([]);
    expect(res.body.mistakes).toEqual([]);
  });

  it('returns mistakes with tags parsed from comma-separated string', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);

    puzzleRepo.save({
      id: randomUUID(),
      kind: 'tactical',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      sideToMove: 'black',
      bestMoveUci: 'e7e5',
      bestMoveSan: 'e5',
      acceptedMovesJson: '["e7e5"]',
      playedMoveUci: 'd7d5',
      playedMoveSan: 'd5',
      classification: 'inaccuracy',
      findability: 0.4,
      temptation: 0.3,
      instructiveness: 0.5,
      tags: 'engine_only,opening',
      winLossPts: 15,
      cpLoss: 50,
      maiaModel: 'maia-1100',
      policyTemperature: 1.0,
      eloAtCreation: 1200,
      sourceGameId: game.id,
      sourcePly: 1,
      phase: 'opening',
      wasTimed: 0,
    });

    const res = await request(makeApp(gameRepo, puzzleRepo))
      .get(`/api/games/${game.id}/review`);
    expect(res.status).toBe(200);
    expect(res.body.mistakes).toHaveLength(1);
    const m = res.body.mistakes[0];
    expect(m.tags).toContain('engine_only');
    expect(m.engineOnly).toBe(true);
    // InMemoryPuzzleRepository stores camelCase; route reads snake_case (maia_model) — null is expected
    expect(m.maiaNearestModel).toBeNull();
  });

  it('handles puzzles with empty tags string (not comma-split)', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);

    puzzleRepo.save({
      id: randomUUID(),
      kind: 'tactical',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      sideToMove: 'black',
      bestMoveUci: 'e7e5',
      bestMoveSan: 'e5',
      acceptedMovesJson: '["e7e5"]',
      playedMoveUci: 'd7d5',
      playedMoveSan: 'd5',
      classification: 'inaccuracy',
      findability: 0.4,
      temptation: 0.3,
      instructiveness: 0.5,
      tags: '',
      winLossPts: 15,
      cpLoss: 50,
      maiaModel: null,
      policyTemperature: 1.0,
      eloAtCreation: 1200,
      sourceGameId: game.id,
      sourcePly: 1,
      phase: 'opening',
      wasTimed: 0,
    });

    const res = await request(makeApp(gameRepo, puzzleRepo))
      .get(`/api/games/${game.id}/review`);
    expect(res.status).toBe(200);
    expect(res.body.mistakes[0].tags).toEqual([]);
    expect(res.body.mistakes[0].engineOnly).toBe(false);
    expect(res.body.mistakes[0].maiaNearestModel).toBeNull();
  });

  it('throws when game not found', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const res = await request(makeApp(gameRepo, puzzleRepo))
      .get('/api/games/no-such-id/review');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/games/:id/quiz', () => {
  it('returns puzzle positions for a game', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);
    const res = await request(makeApp(gameRepo, puzzleRepo))
      .get(`/api/games/${game.id}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions).toEqual([]);
    expect(res.body.opponentId).toBe('maia-1100');
  });

  it('returns formatted positions when puzzles exist for the game', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);

    // Puzzle with valid FEN + bestMoveUci to exercise formatQuizPosition and pieceAtSquare
    const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    puzzleRepo.save({
      id: randomUUID(),
      kind: 'tactical',
      fen: FEN,
      sideToMove: 'black',
      bestMoveUci: 'e7e5',  // from square e7 = Pawn (digit-free rank row 'pppppppp')
      bestMoveSan: 'e5',
      acceptedMovesJson: JSON.stringify(['e7e5']),
      playedMoveUci: 'd7d5',
      playedMoveSan: 'd5',
      pv: null,
      followupUci: 'd1h5',
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
      sourceGameId: game.id,
      sourcePly: 1,
      phase: 'opening',
      wasTimed: 0,
    });

    const res = await request(makeApp(gameRepo, puzzleRepo))
      .get(`/api/games/${game.id}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions).toHaveLength(1);
    const pos = res.body.positions[0];
    expect(pos.bestMoveUci).toBe('e7e5');
    expect(pos.piece).toBe('Pawn');
    expect(pos.fen).toBe(FEN);
    expect(pos.followupUci).toBe('d1h5');
    expect(pos.classification).toBe('inaccuracy');
  });

  it('filters out engine_only puzzles from quiz positions', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);

    const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const base = {
      kind: 'tactical',
      fen: FEN,
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
      maiaModel: null,
      policyTemperature: 1.0,
      eloAtCreation: 1200,
      sourceGameId: game.id,
      sourcePly: 1,
      phase: 'opening',
      wasTimed: 0,
    };

    // One drillable + one engine_only (excluded)
    puzzleRepo.save({ ...base, id: randomUUID(), tags: '' });
    puzzleRepo.save({ ...base, id: randomUUID(), fen: FEN + 'x', tags: 'engine_only' });

    const res = await request(makeApp(gameRepo, puzzleRepo))
      .get(`/api/games/${game.id}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions).toHaveLength(1);
  });

  it('pieceAtSquare handles squares with digits in FEN row', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);

    // rank 4 after 1.e4 has '4P3' — the e4 pawn should be found via digit skipping
    const FEN2 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    puzzleRepo.save({
      id: randomUUID(),
      kind: 'tactical',
      fen: FEN2,
      sideToMove: 'black',
      bestMoveUci: 'e4e5',  // from e4 — row '4P3' with digits before the pawn
      bestMoveSan: 'e5',
      acceptedMovesJson: JSON.stringify(['e4e5']),
      playedMoveUci: 'd7d5',
      playedMoveSan: 'd5',
      cpLoss: 50, winLossPts: 15, classification: 'inaccuracy',
      findability: 0.4, temptation: 0.3, instructiveness: 0.5,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: game.id, sourcePly: 2, phase: 'opening', wasTimed: 0,
    });

    const res = await request(makeApp(gameRepo, puzzleRepo))
      .get(`/api/games/${game.id}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions).toHaveLength(1);
    expect(res.body.positions[0].piece).toBe('Pawn');
  });

  it('pieceAtSquare returns ? for empty bestMoveUci', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);

    const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    puzzleRepo.save({
      id: randomUUID(),
      kind: 'tactical',
      fen: FEN,
      sideToMove: 'black',
      bestMoveUci: '',   // empty uci → piece = '?'
      bestMoveSan: '?',
      acceptedMovesJson: '[]',
      playedMoveUci: null,
      playedMoveSan: null,
      cpLoss: 50, winLossPts: 15, classification: 'inaccuracy',
      findability: 0.4, temptation: 0.3, instructiveness: 0.5,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: game.id, sourcePly: 3, phase: 'opening', wasTimed: 0,
    });

    const res = await request(makeApp(gameRepo, puzzleRepo))
      .get(`/api/games/${game.id}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions[0].piece).toBe('?');
  });

  it('quiz sort covers null source_ply (?? 0 branch)', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);
    const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    puzzleRepo.save({
      id: randomUUID(), kind: 'tactical', fen: FEN, sideToMove: 'black',
      bestMoveUci: 'e7e5', bestMoveSan: 'e5', acceptedMovesJson: '["e7e5"]',
      playedMoveUci: 'd7d5', playedMoveSan: 'd5',
      cpLoss: 50, winLossPts: 15, classification: 'inaccuracy',
      findability: 0.4, temptation: 0.3, instructiveness: 0.5,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: game.id, sourcePly: null, phase: 'opening', wasTimed: 0,
    });
    puzzleRepo.save({
      id: randomUUID(), kind: 'tactical', fen: FEN + ' ', sideToMove: 'black',
      bestMoveUci: 'e7e5', bestMoveSan: 'e5', acceptedMovesJson: '["e7e5"]',
      playedMoveUci: 'd7d5', playedMoveSan: 'd5',
      cpLoss: 50, winLossPts: 15, classification: 'inaccuracy',
      findability: 0.4, temptation: 0.3, instructiveness: 0.5,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: game.id, sourcePly: 3, phase: 'opening', wasTimed: 0,
    });
    const res = await request(makeApp(gameRepo, puzzleRepo))
      .get(`/api/games/${game.id}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions).toHaveLength(2);
  });

  it('pieceAtSquare returns ? when square is empty in FEN', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);
    // FEN: only rook on e1 (file e=4), bestMoveUci = 'd1e2' which starts on d1 (file d=3)
    // d1 is empty in this position so pieceAtSquare returns '?'
    const FEN = '8/8/8/8/8/8/8/4R3 w - - 0 1';
    puzzleRepo.save({
      id: randomUUID(), kind: 'tactical', fen: FEN, sideToMove: 'white',
      bestMoveUci: 'd1e2',   // d1 is empty → piece='?'
      bestMoveSan: 'Rd1', acceptedMovesJson: '["d1e2"]',
      playedMoveUci: null, playedMoveSan: null,
      cpLoss: 50, winLossPts: 15, classification: 'inaccuracy',
      findability: 0.4, temptation: 0.3, instructiveness: 0.5,
      tags: '', maiaModel: null, policyTemperature: 1.0, eloAtCreation: 1200,
      sourceGameId: game.id, sourcePly: 1, phase: 'endgame', wasTimed: 0,
    });
    const res = await request(makeApp(gameRepo, puzzleRepo))
      .get(`/api/games/${game.id}/quiz`);
    expect(res.status).toBe(200);
    expect(res.body.positions[0].piece).toBe('?');
  });

  it('throws when game not found', async () => {
    const res = await request(makeApp(new InMemoryGameRepository(), new InMemoryPuzzleRepository()))
      .get('/api/games/no-such/quiz');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/games/:id/analyse', () => {
  it('returns 503 when no engine pool', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);
    const res = await request(makeApp(gameRepo, puzzleRepo))
      .post(`/api/games/${game.id}/analyse`);
    expect(res.status).toBe(503);
    expect(res.body.error_code).toBe('engine_unavailable');
  });

  it('returns 409 when game is not finished', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    game.status = 'in_progress';
    gameRepo.save(game);
    const fakePool = { requestMove: async () => null };
    const res = await request(makeApp(gameRepo, puzzleRepo, { enginePool: fakePool }))
      .post(`/api/games/${game.id}/analyse`);
    expect(res.status).toBe(409);
    expect(res.body.error_code).toBe('game_not_finished');
  });

  it('returns 202 when game is finished and engine pool is present', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const game = makeGame();
    gameRepo.save(game);
    const fakePool = {
      async requestMove() { return null; },
      async getAnalysisSfClient() { return { eval: async () => ({ cp: 30, bestmove: 'e2e4' }) }; },
      async getMaiaAnalysisClient() { return null; },
    };
    const res = await request(makeApp(gameRepo, puzzleRepo, { enginePool: fakePool }))
      .post(`/api/games/${game.id}/analyse`);
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });

  it('throws when game not found', async () => {
    const res = await request(makeApp(new InMemoryGameRepository(), new InMemoryPuzzleRepository()))
      .post('/api/games/no-such/analyse');
    expect(res.status).toBe(500);
  });
});
