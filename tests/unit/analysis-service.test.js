import { describe, it, expect, vi } from 'vitest';

import { analyseGame } from '../../src/api/ws/analysis-service.js';
import { ScriptedEngineClient } from '../../src/adapters/engine/scripted-engine-client.js';
import { InMemoryGameRepository, InMemoryPuzzleRepository, InMemorySettingsRepository } from '../../src/adapters/memory/repositories.js';

const SF_BLUNDER = [
  'info depth 18 seldepth 24 score cp 100 nodes 100000 pv e2e4',
  'bestmove e2e4',
].join('\n');

const SF_AFTER_BLUNDER = [
  'info depth 18 seldepth 24 score cp -500 nodes 100000 pv e7e5',
  'bestmove e7e5',
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
});
