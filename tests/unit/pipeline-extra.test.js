/**
 * Extra branch coverage for domain/analysis/pipeline.js.
 * Covers catch blocks, existingEvals ?? chains, and sort comparator.
 */
import { describe, it, expect } from 'vitest';

import { runAnalysis } from '../../src/domain/analysis/pipeline.js';
import { ScriptedEngineClient } from '../../src/adapters/engine/scripted-engine-client.js';

const PLIES = ['e2e4', 'e7e5'];

function makeDefaultSf() {
  return new ScriptedEngineClient({ 'default': 'info depth 18 score cp 30 nodes 1 pv e2e4\nbestmove e2e4' });
}

function makeDefaultMaia(bestmove = 'e2e4') {
  const client = new ScriptedEngineClient({}, { defaultBestmove: bestmove });
  client._policyMap = new Map([['e2e4', 0.7], ['d2d4', 0.3]]);
  client.policy = async () => client._policyMap;
  return client;
}

describe('pipeline — existingEvals ?? branch coverage', () => {
  it('existingEvals with camelCase cpWhite covers middle branch of cp ?? chain', async () => {
    const sf = makeDefaultSf();
    const maia = makeDefaultMaia();
    const { moveEvals } = await runAnalysis({
      plies: PLIES,
      playerColor: 'white',
      sfClient: sf,
      maiaClient: maia,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
      existingEvals: [{
        ply: 1,
        cpWhite: 20,   // camelCase — hits the second ?? branch
        bestMoveUci: 'e2e4',
        pv: 'e2e4',
      }],
    });
    expect(moveEvals).toHaveLength(PLIES.length);
  });

  it('existingEvals with no cp/bestmove covers null branch of all ?? chains', async () => {
    const sf = makeDefaultSf();
    const maia = makeDefaultMaia();
    await runAnalysis({
      plies: PLIES,
      playerColor: 'white',
      sfClient: sf,
      maiaClient: maia,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
      existingEvals: [{
        ply: 1,
        // no cp_white, no cpWhite → null ?? null = null
        // no mate_in, no mateIn → null
        // no best_move_uci, no bestMoveUci → null
        // no pv → null
      }],
    });
    // Just verify no throw
  });

  it('existingEvals with null ply covers ply ?? 0 null branch (idx=-1, skipped)', async () => {
    const sf = makeDefaultSf();
    const maia = makeDefaultMaia();
    await runAnalysis({
      plies: PLIES,
      playerColor: 'white',
      sfClient: sf,
      maiaClient: maia,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
      existingEvals: [{
        ply: null,  // ply ?? 0 = 0, idx = -1, skipped by idx >= 0 check
        cpWhite: 20,
      }],
    });
  });

  it('existingEvals with mate_in set covers first ?? branch A on line 60', async () => {
    const sf = makeDefaultSf();
    const maia = makeDefaultMaia();
    await runAnalysis({
      plies: PLIES,
      playerColor: 'white',
      sfClient: sf,
      maiaClient: maia,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
      existingEvals: [{
        ply: 1,
        cp_white: 30,
        mate_in: 3,    // non-null → first ?? branch A: returns 3
        best_move_uci: 'e2e4',
      }],
    });
  });
});

describe('pipeline — pass1 catch block', () => {
  it('re-throws when sfClient.eval throws during pass1', async () => {
    const throwClient = { eval: async () => { throw new Error('engine crash'); } };
    const maia = makeDefaultMaia();
    await expect(runAnalysis({
      plies: PLIES,
      playerColor: 'white',
      sfClient: throwClient,
      maiaClient: maia,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    })).rejects.toThrow('engine crash');
  });
});

describe('pipeline — pass2 catch block', () => {
  it('re-throws when sfClient.eval throws during pass2 deep eval', async () => {
    // For pass2 to run, we need a blunder candidate.
    // sfClient must succeed for pass1 (depth:18) but throw for pass2 (depth:22).
    let callCount = 0;
    const blunderSf = {
      eval: async (_fen, opts) => {
        if (opts?.depth === 22) throw new Error('deep crash');
        // Pass1: return a blunder sequence (cp 300 → cp -300)
        callCount++;
        if (callCount === 1) return { cp: 300, mate: null, bestmove: 'e2e4', pv: 'e2e4' };
        if (callCount === 2) return { cp: -300, mate: null, bestmove: 'e7e5', pv: 'e7e5' };
        return { cp: -300, mate: null, bestmove: 'e7e5', pv: 'e7e5' };
      },
    };
    const maia = makeDefaultMaia();
    await expect(runAnalysis({
      plies: PLIES,
      playerColor: 'white',
      sfClient: blunderSf,
      maiaClient: maia,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    })).rejects.toThrow('deep crash');
  });
});

describe('findability — degraded mode bestmove catch', () => {
  it('uses 0.25 findability when degraded and bestmove also throws', async () => {
    const { probeFindability } = await import('../../src/domain/analysis/findability.js');
    const maiaClient = {
      policy: async () => { throw new Error('policy down'); },
      bestmove: async () => { throw new Error('bestmove down'); },
    };
    const result = await probeFindability({
      maiaClient,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      bestMoveUci: 'e7e5',
      playedMoveUci: 'd7d5',
      winLossPts: 10,
      maiaModel: 'maia-1300',
    });
    expect(result.degraded).toBe(true);
    expect(result.findability).toBe(0.25);
    expect(result.temptation).toBe(0.25);
  });

  it('degraded: maiaMove === playedMoveUci gives 0.75 temptation (covers ternary true branch)', async () => {
    const { probeFindability } = await import('../../src/domain/analysis/findability.js');
    const maiaClient = {
      policy: async () => { throw new Error('policy down'); },
      bestmove: async () => 'd7d5', // matches playedMoveUci
    };
    const result = await probeFindability({
      maiaClient,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      bestMoveUci: 'e7e5',
      playedMoveUci: 'd7d5',
      winLossPts: 10,
      maiaModel: 'maia-1300',
    });
    expect(result.degraded).toBe(true);
    expect(result.temptation).toBe(0.75); // maiaMove === playedMoveUci
  });

  it('non-degraded: bestMove in map, playedMove not → covers both ?? branches', async () => {
    const { probeFindability } = await import('../../src/domain/analysis/findability.js');
    const policyMap = new Map([['e7e5', 0.8]]); // bestMoveUci in map; playedMoveUci NOT
    const maiaClient = {
      policy: async () => policyMap,
    };
    const result = await probeFindability({
      maiaClient,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      bestMoveUci: 'e7e5',   // IN policyMap → 0.8 (non-null path for findability)
      playedMoveUci: 'd7d5', // NOT in policyMap → undefined → ?? 0 (null path for temptation)
      winLossPts: 10,
      maiaModel: 'maia-1300',
    });
    expect(result.degraded).toBe(false);
    expect(result.findability).toBe(0.8);
    expect(result.temptation).toBe(0); // d7d5 not in map → ?? 0
  });

  it('non-degraded: playedMove in map — covers temptation non-null path', async () => {
    const { probeFindability } = await import('../../src/domain/analysis/findability.js');
    const policyMap = new Map([['e7e5', 0.8], ['d7d5', 0.4]]);
    const maiaClient = { policy: async () => policyMap };
    const result = await probeFindability({
      maiaClient,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      bestMoveUci: 'e7e5',
      playedMoveUci: 'd7d5', // IN map → 0.4 (non-null temptation)
      winLossPts: 10,
      maiaModel: 'maia-1300',
    });
    expect(result.temptation).toBe(0.4);
  });

  it('non-degraded: bestMove not in map → findability ?? 0 null branch', async () => {
    const { probeFindability } = await import('../../src/domain/analysis/findability.js');
    const policyMap = new Map([['d7d5', 0.4]]); // bestMoveUci NOT in map
    const maiaClient = { policy: async () => policyMap };
    const result = await probeFindability({
      maiaClient,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      bestMoveUci: 'e7e5',   // NOT in map → undefined ?? 0 = 0 (null branch for findability)
      playedMoveUci: 'd7d5',
      winLossPts: 10,
      maiaModel: 'maia-1300',
    });
    expect(result.findability).toBe(0);
  });
});

describe('pipeline — pass3 maia error handling', () => {
  it('resolves successfully when no puzzle candidates (pass3 not triggered)', async () => {
    // With only 2 plies where the played move IS the best move, no blunder candidates
    // exist, so pass3 (maia findability) never runs. The pipeline completes normally.
    const sf = makeDefaultSf();
    const throwMaia = {
      policy: async () => { throw new Error('maia crash'); },
      bestmove: async () => { throw new Error('maia crash'); },
    };
    const result = await runAnalysis({
      plies: PLIES,
      playerColor: 'white',
      sfClient: sf,
      maiaClient: throwMaia,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });
    expect(result.moveEvals).toHaveLength(PLIES.length);
  });
});
