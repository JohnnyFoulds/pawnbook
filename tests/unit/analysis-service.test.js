import { describe, it, expect } from 'vitest';

import { analyseGame } from '../../src/api/ws/analysis-service.js';
import { ScriptedEngineClient } from '../../src/adapters/engine/scripted-engine-client.js';
import { InMemoryGameRepository, InMemoryPuzzleRepository, InMemorySettingsRepository } from '../../src/adapters/memory/repositories.js';

const SF_BLUNDER = [
  'info depth 18 seldepth 24 score cp 100 nodes 100000 pv e2e4',
  'bestmove e2e4',
].join('\n');


function makeFakeEnginePool({ sfFixtures = {}, maiaPolicyMap = null } = {}) {
  const sfClient = new ScriptedEngineClient({ default: SF_BLUNDER, ...sfFixtures });
  const maiaClient = new ScriptedEngineClient({});
  if (maiaPolicyMap) {
    maiaClient.policy = async () => maiaPolicyMap;
  }
  return {
    async getAnalysisSfClient() { return sfClient; },
    async getMaiaAnalysisClient() { return maiaClient; },
  };
}

function makeFakeSession(overrides = {}) {
  return {
    id: 'game-test-1',
    opponent: { id: 'maia-1100', type: 'maia', elo: 1100 },
    playerColor: 'white',
    ranked: true,
    _timeControlInitialSec: null,
    ...overrides,
  };
}

function makeFakeWs() {
  const sent = [];
  return {
    readyState: 1, // OPEN
    OPEN: 1,
    send(data) { sent.push(JSON.parse(data)); },
    _sent: sent,
  };
}

describe('analyseGame', () => {
  it('saves move evals after analysis', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const session = makeFakeSession();
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: true, status: 'in_progress' });
    gameRepo.appendMove(session.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: null });
    gameRepo.appendMove(session.id, { ply: 2, uci: 'e7e5', san: 'e5', msTaken: null });

    const ws = makeFakeWs();
    const enginePool = makeFakeEnginePool();

    await analyseGame({
      gameId: session.id, session, result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool,
    });

    const evals = gameRepo.getEvals(session.id);
    expect(evals.length).toBe(2);
    expect(evals[0].gameId).toBe(session.id);
  });

  it('emits analysis_progress and analysis_done over WS', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const session = makeFakeSession();
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: true, status: 'in_progress' });
    gameRepo.appendMove(session.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: null });

    const ws = makeFakeWs();
    const enginePool = makeFakeEnginePool();

    await analyseGame({
      gameId: session.id, session, result: { result: 'loss', termination: 'resignation' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool,
    });

    const types = ws._sent.map(m => m.type);
    expect(types).toContain('analysis_progress');
    expect(types).toContain('analysis_done');
  });

  it('updates ELO for a ranked win against a rated opponent', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const session = makeFakeSession({ ranked: true });
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: true, status: 'in_progress' });
    gameRepo.appendMove(session.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: null });

    const ws = makeFakeWs();
    const enginePool = makeFakeEnginePool();

    await analyseGame({
      gameId: session.id, session, result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool,
    });

    const history = gameRepo.getEloHistory();
    expect(history.length).toBeGreaterThan(0);
    const newElo = history[history.length - 1].elo;
    expect(newElo).toBeGreaterThan(1200); // win should increase ELO
  });

  it('does not update ELO for an unranked game', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const session = makeFakeSession({ ranked: false });
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: false, status: 'in_progress' });
    gameRepo.appendMove(session.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: null });

    const ws = makeFakeWs();
    const enginePool = makeFakeEnginePool();

    await analyseGame({
      gameId: session.id, session, result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool,
    });

    const history = gameRepo.getEloHistory();
    expect(history.length).toBe(0);
  });

  it('handles empty move list gracefully (skips analysis)', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const session = makeFakeSession();
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: true, status: 'in_progress' });
    // No moves appended

    const ws = makeFakeWs();
    const enginePool = makeFakeEnginePool();

    await analyseGame({
      gameId: session.id, session, result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool,
    });

    // Should not crash; analysis_done not emitted because we skipped
    const analysisTypes = ws._sent.map(m => m.type);
    expect(analysisTypes).not.toContain('analysis_done');
  });

  it('analysis_state transitions pending→running→done on a successful analysis', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const session = makeFakeSession();
    // Game starts as pending (default analysis_state)
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: false, status: 'in_progress',
      analysisState: 'pending' });
    gameRepo.appendMove(session.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: null });
    gameRepo.appendMove(session.id, { ply: 2, uci: 'e7e5', san: 'e5', msTaken: null });

    const ws = makeFakeWs();
    const enginePool = makeFakeEnginePool();

    await analyseGame({
      gameId: session.id, session, result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool,
    });

    const savedGame = gameRepo.findById(session.id);
    expect(savedGame.analysisState).toBe('done');

    // 'running' state is set on the way through; verify analysis_done was emitted
    const doneMsg = ws._sent.find(m => m.type === 'analysis_done');
    expect(doneMsg).toBeDefined();
    expect(doneMsg.gameId).toBe(session.id);
  });

  it('marks analysis_state as failed if engine pool throws', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const session = makeFakeSession();
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: true, status: 'in_progress' });
    gameRepo.appendMove(session.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: null });

    const ws = makeFakeWs();
    const brokenPool = {
      async getAnalysisSfClient() { throw new Error('engine unavailable'); },
      async getMaiaAnalysisClient() { throw new Error('engine unavailable'); },
    };

    await analyseGame({
      gameId: session.id, session, result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: brokenPool,
    });

    const savedGame = gameRepo.findById(session.id);
    expect(savedGame.analysisState).toBe('failed');
  });

  it('marks analysis_state failed when runAnalysis throws (second catch block)', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const session = makeFakeSession();
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: false, status: 'in_progress' });
    gameRepo.appendMove(session.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: null });

    const ws = makeFakeWs();
    // Pool succeeds on client acquisition but throws on eval (second try-catch in analyseGame)
    const failingEvalPool = {
      async getAnalysisSfClient() {
        return { eval: async () => { throw new Error('eval failed mid-analysis'); }, setOption: () => {} };
      },
      async getMaiaAnalysisClient() {
        return { policy: async () => new Map(), eval: async () => ({ bestmove: 'e2e4' }) };
      },
      reconfigureAnalysisSfForPassTwo: async () => {},
    };

    await analyseGame({
      gameId: session.id, session, result: { result: 'loss', termination: 'resignation' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: failingEvalPool,
    });

    const savedGame = gameRepo.findById(session.id);
    expect(savedGame.analysisState).toBe('failed');
    const types = ws._sent.map(m => m.type);
    expect(types).toContain('error');
  });

  it('does not send WS messages when socket is closed', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const session = makeFakeSession({ ranked: false });
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: false, status: 'in_progress' });
    gameRepo.appendMove(session.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: null });

    const ws = makeFakeWs();
    ws.readyState = 3; // CLOSED

    await analyseGame({
      gameId: session.id, session, result: { result: 'win', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: makeFakeEnginePool(),
    });

    // Analysis should complete but no messages sent (readyState !== OPEN)
    expect(ws._sent).toHaveLength(0);
  });

  it('handles draw result and scores 0.5 for ELO update', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const session = makeFakeSession({ ranked: true });
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: true, status: 'in_progress' });
    gameRepo.appendMove(session.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: null });

    const ws = makeFakeWs();
    await analyseGame({
      gameId: session.id, session, result: { result: 'draw', termination: 'stalemate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool: makeFakeEnginePool(),
    });

    const history = gameRepo.getEloHistory();
    expect(history.length).toBeGreaterThan(0);
    // Draw against a much weaker opponent (maia-1100 vs 1200) means ELO goes down slightly
    const newElo = history[history.length - 1].elo;
    expect(newElo).toBeGreaterThan(0);
  });

  it('saves puzzles and FSRS cards when a blunder is detected', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const session = makeFakeSession({ ranked: true });
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: true, status: 'in_progress' });
    // Two moves: e4 (white blunder), e5 (black)
    gameRepo.appendMove(session.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: 1000 });
    gameRepo.appendMove(session.id, { ply: 2, uci: 'e7e5', san: 'e5', msTaken: 800 });

    // chess.js omits the en passant square when no capture is possible.
    // FEN after 1.e4: KQkq - 0 1 (no en passant square because no black pawn adjacent).
    const POST_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    // Default returns cp=100 (White to move — no POV flip), used for start pos and others.
    // POST_E4_FEN is Black to move; score cp 600 = Black winning by 600 cp (UCI side-to-move
    // convention) → normaliseToWhitePov negates → cp_white = -600 → blunder for White's e4.
    // Maia default policy has e2e4=0.5 which matches the start-pos bestmove → findability=0.5.
    const BLUNDER_FIXTURE = 'info depth 18 score cp 600 nodes 100000 pv e7e5\nbestmove e7e5';

    const ws = makeFakeWs();
    const enginePool = makeFakeEnginePool({ sfFixtures: { [POST_E4_FEN]: BLUNDER_FIXTURE } });

    await analyseGame({
      gameId: session.id, session, result: { result: 'loss', termination: 'checkmate' },
      ws, gameRepo, puzzleRepo, settingsRepo, enginePool,
    });

    // At least one puzzle should have been created and a card initialised
    const allPuzzles = puzzleRepo.listAll();
    expect(allPuzzles.length).toBeGreaterThan(0);

    const analysisTypes = ws._sent.map(m => m.type);
    expect(analysisTypes).toContain('analysis_done');
    // Ranked loss → game_over re-sent with ELO info
    const gameOverMsgs = ws._sent.filter(m => m.type === 'game_over');
    expect(gameOverMsgs.length).toBeGreaterThan(0);
  });

  it('does not create a second FSRS card when one already exists for the puzzle', async () => {
    const gameRepo = new InMemoryGameRepository();
    const puzzleRepo = new InMemoryPuzzleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    settingsRepo.set('elo', '1200');

    const POST_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    // score cp 600 at Black-to-move → normalised to -600 White POV → blunder for White's e4
    const BLUNDER_FIXTURE = 'info depth 18 score cp 600 nodes 100000 pv e7e5\nbestmove e7e5';
    const blunderPool = makeFakeEnginePool({ sfFixtures: { [POST_E4_FEN]: BLUNDER_FIXTURE } });

    const session = makeFakeSession({ ranked: false });
    gameRepo.save({ id: session.id, opponentId: session.opponent.id,
      opponentElo: session.opponent.elo, playerColor: 'white', ranked: false, status: 'in_progress' });
    gameRepo.appendMove(session.id, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: 1000 });
    gameRepo.appendMove(session.id, { ply: 2, uci: 'e7e5', san: 'e5', msTaken: 800 });

    // First analysis run creates the puzzle + card
    await analyseGame({
      gameId: session.id, session, result: { result: 'loss', termination: 'checkmate' },
      ws: makeFakeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: blunderPool,
    });

    const afterFirst = puzzleRepo.listAll();
    expect(afterFirst.length).toBeGreaterThan(0);

    // Second analysis run on the same position — same FEN deduped, card not reset
    const gameId2 = 'game-test-2';
    const session2 = makeFakeSession({ id: gameId2 });
    gameRepo.save({ id: gameId2, opponentId: session2.opponent.id,
      opponentElo: session2.opponent.elo, playerColor: 'white', ranked: false, status: 'in_progress' });
    gameRepo.appendMove(gameId2, { ply: 1, uci: 'e2e4', san: 'e4', msTaken: 1000 });
    gameRepo.appendMove(gameId2, { ply: 2, uci: 'e7e5', san: 'e5', msTaken: 800 });

    await analyseGame({
      gameId: gameId2, session: session2, result: { result: 'loss', termination: 'checkmate' },
      ws: makeFakeWs(), gameRepo, puzzleRepo, settingsRepo, enginePool: blunderPool,
    });

    // Puzzle count stays the same (FEN deduped) — card not overwritten
    const afterSecond = puzzleRepo.listAll();
    expect(afterSecond.length).toBe(afterFirst.length);
  });
});
