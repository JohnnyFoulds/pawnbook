import { describe, it, expect } from 'vitest';

import { probeFindability, nearestMaiaModel } from '../../src/domain/analysis/findability.js';
import { ScriptedEngineClient } from '../../src/adapters/engine/scripted-engine-client.js';

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

describe('findability', () => {
  it('findability is P_maia of the stockfish best move', async () => {
    const policyMap = new Map([['e2e4', 0.45], ['d7d5', 0.2]]);
    const client = new ScriptedEngineClient({}, { defaultBestmove: 'e2e4' });
    client.policy = async () => policyMap;

    const result = await probeFindability({
      maiaClient: client,
      fen: FEN,
      bestMoveUci: 'e2e4',
      playedMoveUci: 'd7d5',
      winLossPts: 15,
      maiaModel: 'maia-1300',
    });

    expect(result.findability).toBeCloseTo(0.45, 5);
  });

  it('temptation is P_maia of the played move', async () => {
    const policyMap = new Map([['e2e4', 0.45], ['d7d5', 0.2]]);
    const client = new ScriptedEngineClient({}, { defaultBestmove: 'e2e4' });
    client.policy = async () => policyMap;

    const result = await probeFindability({
      maiaClient: client,
      fen: FEN,
      bestMoveUci: 'e2e4',
      playedMoveUci: 'd7d5',
      winLossPts: 15,
      maiaModel: 'maia-1300',
    });

    expect(result.temptation).toBeCloseTo(0.2, 5);
  });

  it('instructiveness = winLossPts * findability', async () => {
    const policyMap = new Map([['e2e4', 0.3], ['d7d5', 0.1]]);
    const client = new ScriptedEngineClient({}, { defaultBestmove: 'e2e4' });
    client.policy = async () => policyMap;

    const result = await probeFindability({
      maiaClient: client,
      fen: FEN,
      bestMoveUci: 'e2e4',
      playedMoveUci: 'd7d5',
      winLossPts: 20,
      maiaModel: 'maia-1300',
    });

    expect(result.instructiveness).toBeCloseTo(20 * 0.3, 3);
  });

  it('degraded=false when policy returns a valid map', async () => {
    const policyMap = new Map([['e2e4', 0.5]]);
    const client = new ScriptedEngineClient({}, { defaultBestmove: 'e2e4' });
    client.policy = async () => policyMap;

    const result = await probeFindability({
      maiaClient: client,
      fen: FEN,
      bestMoveUci: 'e2e4',
      playedMoveUci: 'e2e4',
      winLossPts: 10,
      maiaModel: 'maia-1300',
    });

    expect(result.degraded).toBe(false);
  });

  it('degrades to binary 1.0 when policy throws and Maia agrees with Stockfish', async () => {
    const client = new ScriptedEngineClient({}, { defaultBestmove: 'e2e4' });
    client.policy = async () => { throw new Error('lc0 crashed'); };
    // bestmove() falls through to eval → returns defaultBestmove

    const result = await probeFindability({
      maiaClient: client,
      fen: FEN,
      bestMoveUci: 'e2e4', // matches defaultBestmove
      playedMoveUci: 'd2d4',
      winLossPts: 10,
      maiaModel: 'maia-1300',
    });

    expect(result.degraded).toBe(true);
    expect(result.findability).toBe(1.0);
  });

  it('degrades to binary 0.25 when policy throws and Maia disagrees with Stockfish', async () => {
    const client = new ScriptedEngineClient({}, { defaultBestmove: 'd2d4' });
    client.policy = async () => { throw new Error('lc0 crashed'); };

    const result = await probeFindability({
      maiaClient: client,
      fen: FEN,
      bestMoveUci: 'e2e4', // different from defaultBestmove
      playedMoveUci: 'g1f3',
      winLossPts: 10,
      maiaModel: 'maia-1300',
    });

    expect(result.degraded).toBe(true);
    expect(result.findability).toBe(0.25);
  });

  it('degrades to binary when policy returns empty map', async () => {
    const client = new ScriptedEngineClient({}, { defaultBestmove: 'e2e4' });
    client.policy = async () => new Map(); // empty

    const result = await probeFindability({
      maiaClient: client,
      fen: FEN,
      bestMoveUci: 'e2e4',
      playedMoveUci: 'd2d4',
      winLossPts: 10,
      maiaModel: 'maia-1300',
    });

    expect(result.degraded).toBe(true);
  });
});

describe('nearestMaiaModel', () => {
  const weights = ['maia-1100', 'maia-1300', 'maia-1500', 'maia-1700', 'maia-1900'];

  it('returns the nearest model below ELO', () => {
    expect(nearestMaiaModel(1200, weights)).toBe('maia-1100');
  });

  it('returns the nearest model above ELO', () => {
    expect(nearestMaiaModel(1400, weights)).toBe('maia-1300');
  });

  it('returns exact match when available', () => {
    expect(nearestMaiaModel(1500, weights)).toBe('maia-1500');
  });

  it('returns the only model when only one available', () => {
    expect(nearestMaiaModel(2000, ['maia-1500'])).toBe('maia-1500');
  });

  it('throws when no Maia weights available', () => {
    expect(() => nearestMaiaModel(1500, ['sf-1400'])).toThrow('No Maia weights available');
  });
});
