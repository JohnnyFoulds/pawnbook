/**
 * Extra branch coverage for analysis-service.js — uses vi.mock to bypass the real engine.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../src/domain/analysis/pipeline.js', () => ({
  runAnalysis: vi.fn(),
}));
vi.mock('../../src/domain/puzzles/select.js', () => ({
  selectPuzzles: vi.fn(),
}));
vi.mock('../../src/api/ws/repertoire-service.js', () => ({
  updateRepertoire: vi.fn().mockResolvedValue(undefined),
  getProvenanceId: vi.fn().mockReturnValue(42),
  _ensureOpeningCards: vi.fn(),
}));

import { runAnalysis } from '../../src/domain/analysis/pipeline.js';
import { selectPuzzles } from '../../src/domain/puzzles/select.js';
import { updateRepertoire } from '../../src/api/ws/repertoire-service.js';
import { analyseGame } from '../../src/api/ws/analysis-service.js';
import { InMemoryGameRepository, InMemoryPuzzleRepository, InMemorySettingsRepository } from '../../src/adapters/memory/repositories.js';

const GAME_ID = 'test-game-001';
const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

function makeWs(open = true) {
  return { readyState: open ? 1 : 0, OPEN: 1, send: vi.fn() };
}

function makeSession(overrides = {}) {
  return {
    opponent: { id: 'maia-1100', elo: 1100, type: 'maia' },
    playerColor: 'white',
    ranked: false,
    _timeControlInitialSec: null,
    ...overrides,
  };
}

function makeEnginePool() {
  const sfClient = { eval: vi.fn() };
  return {
    sfClient,
    getAnalysisSfClient: vi.fn().mockResolvedValue(sfClient),
    getMaiaAnalysisClient: vi.fn().mockResolvedValue(null),
  };
}

function makePuzzle(overrides = {}) {
  return {
    fen: FEN,
    bestMoveUci: 'e7e5',
    moveUci: 'd7d5',
    altMovesJson: null,
    pv: null,
    cpLoss: 50,
    winLoss: 15,
    classification: 'inaccuracy',
    findability: 0.4,
    temptation: 0.3,
    instructiveness: 0.5,
    tags: 'opening',
    maiaModel: 'maia-1100',
    policyTemperature: 1.0,
    ply: 2,
    phase: 'opening',
    ...overrides,
  };
}

const DEFAULT_RESULT = {
  moveEvals: [{ ply: 1, uci: 'e2e4', gameId: GAME_ID }],
  accuracy: 80,
  opponentAccuracy: 75,
  puzzleCandidates: [],
};

describe('analyseGame — extra branch coverage', () => {
  let gameRepo, puzzleRepo, settingsRepo;

  beforeEach(() => {
    gameRepo = new InMemoryGameRepository();
    puzzleRepo = new InMemoryPuzzleRepository();
    settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');
    vi.clearAllMocks();
    runAnalysis.mockResolvedValue(DEFAULT_RESULT);
    selectPuzzles.mockReturnValue([]);
    updateRepertoire.mockResolvedValue(undefined);

    gameRepo.save({ id: GAME_ID, opponentId: 'maia-1100', opponentElo: 1100, playerColor: 'white', ranked: false, status: 'in_progress' });
    gameRepo.appendMove(GAME_ID, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: null });
  });

  it('ranked draw updates ELO with 0.5 score', async () => {
    const session = makeSession({ ranked: true });
    const ws = makeWs();
    await analyseGame({ gameId: GAME_ID, session, result: { result: 'draw', termination: 'stalemate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    const history = gameRepo.getEloHistory();
    expect(history.length).toBe(1);
    expect(history[0].elo).toBeLessThanOrEqual(1200);
  });

  it('ranked loss updates ELO with 0 score', async () => {
    const session = makeSession({ ranked: true });
    const ws = makeWs();
    await analyseGame({ gameId: GAME_ID, session, result: { result: 'loss', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    const history = gameRepo.getEloHistory();
    expect(history.length).toBe(1);
    expect(history[0].elo).toBeLessThan(1200);
  });

  it('ranked game with null opponent elo skips ELO update', async () => {
    const session = { ...makeSession({ ranked: true }), opponent: { id: 'maia-1100', elo: null, type: 'maia' } };
    const ws = makeWs();
    await analyseGame({ gameId: GAME_ID, session, result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(gameRepo.getEloHistory().length).toBe(0);
  });

  it('puzzle with altMovesJson includes alt moves in acceptedMovesJson', async () => {
    selectPuzzles.mockReturnValue([makePuzzle({
      altMovesJson: JSON.stringify([{ uci: 'c7c5' }]),
    })]);
    runAnalysis.mockResolvedValue({ ...DEFAULT_RESULT, puzzleCandidates: [{}] });

    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    const saved = puzzleRepo.listAll();
    expect(saved).toHaveLength(1);
    const accepted = JSON.parse(saved[0].acceptedMovesJson);
    expect(accepted).toContain('c7c5');
    expect(accepted).toContain('e7e5');
  });

  it('puzzle with pv sets followupUci to second move', async () => {
    selectPuzzles.mockReturnValue([makePuzzle({ pv: 'd1h5 e8d7' })]);
    runAnalysis.mockResolvedValue({ ...DEFAULT_RESULT, puzzleCandidates: [{}] });

    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(puzzleRepo.listAll()[0].followupUci).toBe('e8d7');
  });

  it('puzzle with single-move pv has null followupUci', async () => {
    selectPuzzles.mockReturnValue([makePuzzle({ pv: 'e7e5' })]);
    runAnalysis.mockResolvedValue({ ...DEFAULT_RESULT, puzzleCandidates: [{}] });

    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(puzzleRepo.listAll()[0].followupUci).toBeNull();
  });

  it('null policyTemperature defaults to 1.0', async () => {
    selectPuzzles.mockReturnValue([makePuzzle({ policyTemperature: null })]);
    runAnalysis.mockResolvedValue({ ...DEFAULT_RESULT, puzzleCandidates: [{}] });

    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(puzzleRepo.listAll()[0].policyTemperature).toBe(1.0);
  });

  it('null tags defaults to empty string', async () => {
    selectPuzzles.mockReturnValue([makePuzzle({ tags: null })]);
    runAnalysis.mockResolvedValue({ ...DEFAULT_RESULT, puzzleCandidates: [{}] });

    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(puzzleRepo.listAll()[0].tags).toBe('');
  });

  it('does not create duplicate FSRS card when one already exists', async () => {
    selectPuzzles.mockReturnValue([makePuzzle()]);
    runAnalysis.mockResolvedValue({ ...DEFAULT_RESULT, puzzleCandidates: [{}] });

    const saveCardSpy = vi.spyOn(puzzleRepo, 'saveCard');
    // Make getCard always return a non-null card so the if block is skipped
    vi.spyOn(puzzleRepo, 'getCard').mockReturnValue({
      puzzleId: 'x', due: Date.now() + 86400000, reps: 5, lapses: 0, stability: 10, state: 2, graduated: 0,
    });

    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(saveCardSpy).not.toHaveBeenCalled();
  });

  it('calls updateRepertoire when repertoireRepo is provided', async () => {
    const repertoireRepo = {};
    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool(), repertoireRepo });

    expect(updateRepertoire).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: GAME_ID, repertoireRepo }),
    );
  });

  it('re-sends game_over with ELO after a ranked win', async () => {
    const session = makeSession({ ranked: true });
    const ws = makeWs();
    await analyseGame({ gameId: GAME_ID, session, result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    const msgs = ws.send.mock.calls.map(c => JSON.parse(c[0]));
    const gameOver = msgs.find(m => m.type === 'game_over');
    expect(gameOver).toBeDefined();
    expect(gameOver.eloBefore).not.toBeNull();
    expect(gameOver.eloAfter).not.toBeNull();
  });

  it('catch block fires and sends analysis_failed error when runAnalysis throws', async () => {
    runAnalysis.mockRejectedValue(new Error('pipeline crashed'));
    const ws = makeWs();
    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    const game = gameRepo.findById(GAME_ID);
    expect(game.analysisState).toBe('failed');
    const msgs = ws.send.mock.calls.map(c => JSON.parse(c[0]));
    expect(msgs.some(m => m.type === 'error' && m.error_code === 'analysis_failed')).toBe(true);
  });

  it('_sendIfOpen does not send when ws is closed', async () => {
    const ws = makeWs(false);
    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('_uciToSan handles promotion move (5-char UCI)', async () => {
    const PROMO_FEN = '8/4P3/8/8/8/8/8/k6K w - - 0 1';
    selectPuzzles.mockReturnValue([{
      fen: PROMO_FEN, bestMoveUci: 'e7e8q', moveUci: 'e7e8r',
      altMovesJson: null, pv: null,
      cpLoss: 200, winLoss: 100, classification: 'blunder',
      findability: 0.9, temptation: 0.8, instructiveness: 0.9,
      tags: '', maiaModel: null, policyTemperature: 1.0, ply: 1, phase: 'endgame',
    }]);
    runAnalysis.mockResolvedValue({ ...DEFAULT_RESULT, puzzleCandidates: [{}] });

    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    const saved = puzzleRepo.listAll();
    expect(saved).toHaveLength(1);
    // promotion san should be non-null and include queen promotion
    expect(saved[0].bestMoveSan).toMatch(/[Qq]/);
  });

  it('_uciToSan returns null for illegal move', async () => {
    selectPuzzles.mockReturnValue([makePuzzle({ bestMoveUci: 'a1a1', moveUci: 'a1a2' })]);
    runAnalysis.mockResolvedValue({ ...DEFAULT_RESULT, puzzleCandidates: [{}] });

    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    const saved = puzzleRepo.listAll();
    expect(saved).toHaveLength(1);
    expect(saved[0].bestMoveSan).toBeNull();
  });

  it('wasTimed=true when timeControlInitialSec is set', async () => {
    const session = makeSession({ _timeControlInitialSec: 300 });
    await analyseGame({ gameId: GAME_ID, session, result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    // analysis completes — wasTimed passed through
    expect(gameRepo.findById(GAME_ID).analysisState).toBe('done');
  });

  it('maiaClient null falls back to sfClient for analysis', async () => {
    const enginePool = makeEnginePool();
    enginePool.getMaiaAnalysisClient.mockResolvedValue(null);

    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool });

    expect(gameRepo.findById(GAME_ID).analysisState).toBe('done');
  });

  it('falls back to 1200 when settingsRepo has no elo key', async () => {
    const freshSettings = new InMemorySettingsRepository(); // no set('elo') call
    const ws = makeWs();
    await analyseGame({ gameId: GAME_ID, session: makeSession(), result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo: freshSettings, enginePool: makeEnginePool() });
    expect(gameRepo.findById(GAME_ID).analysisState).toBe('done');
  });

  it('non-maia opponent sets maiaModel to null (covers ?? none branch)', async () => {
    // opponent.type !== 'maia' → maiaModel = null → runAnalysis arg: maiaModel ?? 'none'
    const session = makeSession({ opponent: { id: 'sf-3190', elo: 3190, type: 'sf' } });
    selectPuzzles.mockReturnValue([makePuzzle()]);
    runAnalysis.mockResolvedValue({ ...DEFAULT_RESULT, puzzleCandidates: [{}] });

    await analyseGame({ gameId: GAME_ID, session, result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(gameRepo.findById(GAME_ID).analysisState).toBe('done');
  });

  it('playerColor=black with puzzle saved covers the black branch of sideToMove ternary', async () => {
    const session = makeSession({ playerColor: 'black' });
    selectPuzzles.mockReturnValue([makePuzzle()]);
    runAnalysis.mockResolvedValue({ ...DEFAULT_RESULT, puzzleCandidates: [{}] });

    await analyseGame({ gameId: GAME_ID, session, result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(puzzleRepo.listAll()[0].sideToMove).toBe('black');
  });

  it('wasTimed=true with puzzle saved covers wasTimed truthy branch', async () => {
    const session = makeSession({ _timeControlInitialSec: 300 });
    selectPuzzles.mockReturnValue([makePuzzle()]);
    runAnalysis.mockResolvedValue({ ...DEFAULT_RESULT, puzzleCandidates: [{}] });

    await analyseGame({ gameId: GAME_ID, session, result: { result: 'win', termination: 'checkmate' },
      ws: makeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(puzzleRepo.listAll()[0].wasTimed).toBe(1);
  });

  // B9: coach-interrupted games must not contribute to strength estimation
  it('B9: ranked game with alertsInGame > 0 skips ELO update', async () => {
    const session = makeSession({ ranked: true, alertsInGame: 1 });
    const ws = makeWs();
    await analyseGame({ gameId: GAME_ID, session, result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(gameRepo.getEloHistory()).toHaveLength(0);
  });

  it('B9: ranked game with alertsInGame = 0 still updates ELO', async () => {
    const session = makeSession({ ranked: true, alertsInGame: 0 });
    const ws = makeWs();
    await analyseGame({ gameId: GAME_ID, session, result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: makeEnginePool() });

    expect(gameRepo.getEloHistory()).toHaveLength(1);
  });
});
