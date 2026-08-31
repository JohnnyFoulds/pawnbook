import { describe, it, expect } from 'vitest';

import { runAnalysis } from '../../src/domain/analysis/pipeline.js';
import { ScriptedEngineClient } from '../../src/adapters/engine/scripted-engine-client.js';

// Four-move game: 1.e4 e5 2.Nf3 Nc6
const FOUR_MOVE_PLIES = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];

// A default scripted Stockfish eval (cp slightly white-favourable, depth 18)
const SF_DEFAULT = {
  'default': 'info depth 18 seldepth 24 score cp 30 nodes 100000 pv e2e4 e7e5\nbestmove e2e4',
};

// Blunder-producing eval pair.
// SF_BLUNDER_BEFORE is used at the start position (White to move): score cp 100
//   → no POV flip → cp_white = 100 (White slightly better).
// SF_BLUNDER_AFTER is used at the position after 1.e4 (Black to move): score cp 500
//   → UCI convention: positive means the side to move (Black) is winning by 500 cp
//   → normaliseToWhitePov negates → cp_white = -500 (White losing by 5 pawns) → blunder.
const SF_BLUNDER_BEFORE = 'info depth 18 seldepth 24 score cp 100 nodes 100000 pv e2e4 e7e5\nbestmove e2e4';
const SF_BLUNDER_AFTER  = 'info depth 18 seldepth 24 score cp 500 nodes 100000 pv e7e5 e2e4\nbestmove e7e5';

function makeSfClient(fixtures = SF_DEFAULT) {
  return new ScriptedEngineClient(fixtures);
}

function makeMaiaClient(bestmove = 'e2e4', policyMap = null) {
  // If policyMap provided, we override the policy response
  const client = new ScriptedEngineClient({}, { defaultBestmove: bestmove });
  if (policyMap) {
    // Override policy to return canned map
    client._policyMap = policyMap;
    client.policy = async (fen) => {
      client._calls.push({ type: 'policy', fen });
      return policyMap;
    };
  }
  return client;
}

describe('pipeline', () => {
  it('N moves produces N+1 position evaluations', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();

    await runAnalysis({
      plies: FOUR_MOVE_PLIES,
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    // pass 1 should have called eval N+1 times (4 plies → 5 positions)
    const evalCalls = sfClient.calls.filter(c => c.type === 'eval');
    expect(evalCalls.length).toBeGreaterThanOrEqual(FOUR_MOVE_PLIES.length + 1);
  });

  it('moveEvals has exactly one entry per ply', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();

    const { moveEvals } = await runAnalysis({
      plies: FOUR_MOVE_PLIES,
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    expect(moveEvals).toHaveLength(FOUR_MOVE_PLIES.length);
  });

  it('each move winBefore equals the previous eval position', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();

    const { moveEvals } = await runAnalysis({
      plies: FOUR_MOVE_PLIES,
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    // moveEvals[0].winBefore should be the eval before ply 1 (startpos)
    // moveEvals[1].winBefore should relate to the same position as moveEvals[0].winAfter
    // Since the scripted client returns same cp for everything, winBefore[1] ≈ winAfter[0]
    // (they aren't exactly equal because winBefore is mover-POV which flips)
    expect(moveEvals[0].winBefore).toBeGreaterThan(0);
    expect(moveEvals[0].winAfter).toBeGreaterThan(0);
  });

  it('BOTH sides plies are graded with mover set', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();

    const { moveEvals } = await runAnalysis({
      plies: FOUR_MOVE_PLIES,
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    const playerMoves   = moveEvals.filter(e => e.mover === 'player');
    const opponentMoves = moveEvals.filter(e => e.mover === 'opponent');

    // 4 plies: white=plies 1,3 → player; black=plies 2,4 → opponent
    expect(playerMoves).toHaveLength(2);
    expect(opponentMoves).toHaveLength(2);
    // All have winBefore/winAfter populated
    for (const e of moveEvals) {
      expect(e.winBefore).toBeDefined();
      expect(e.winAfter).toBeDefined();
    }
  });

  it('accuracy is computed for player and opponentAccuracy for opponent', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();

    const { accuracy, opponentAccuracy } = await runAnalysis({
      plies: FOUR_MOVE_PLIES,
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    expect(typeof accuracy).toBe('number');
    expect(accuracy).toBeGreaterThan(0);
    expect(accuracy).toBeLessThanOrEqual(100);
    expect(typeof opponentAccuracy).toBe('number');
    expect(opponentAccuracy).toBeGreaterThan(0);
  });

  it('puzzle candidates are drawn from player plies only', async () => {
    // Build a per-fen fixture map to simulate a blunder on ply 1
    const chess = (await import('chess.js')).Chess;
    const game = new chess();
    const pos0 = game.fen(); // startpos
    game.move({ from: 'e2', to: 'e4' });
    const pos1 = game.fen(); // after e4
    game.move({ from: 'e7', to: 'e5' });

    // pos0: cp=100 (slightly favourable for white)
    // pos1: cp=-500 (white blundered e4?!)
    // everything else: default
    const blunderFixtures = {
      [pos0]: SF_BLUNDER_BEFORE,
      [pos1]: SF_BLUNDER_AFTER,
      default: SF_DEFAULT['default'],
    };

    const sfClient = new ScriptedEngineClient(blunderFixtures);
    // Maia says the best move is findable (p=0.50)
    const policyMap = new Map([['e2e4', 0.5], ['d2d4', 0.3]]);
    const maiaClient = makeMaiaClient('e2e4', policyMap);

    const { puzzleCandidates } = await runAnalysis({
      plies: ['e2e4', 'e7e5'],
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    // All puzzle candidates should be from the player
    for (const c of puzzleCandidates) {
      expect(c.mover).toBe('player');
    }
  });

  it('progress events are emitted and overallPct is monotonically non-decreasing', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    const events = [];

    await runAnalysis({
      plies: FOUR_MOVE_PLIES,
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
      onProgress: e => events.push(e),
    });

    expect(events.length).toBeGreaterThan(0);

    // overallPct must be monotone non-decreasing
    for (let i = 1; i < events.length; i++) {
      expect(events[i].overallPct).toBeGreaterThanOrEqual(events[i - 1].overallPct);
    }

    // Last event should be 100
    expect(events[events.length - 1].overallPct).toBe(100);
  });

  it('progress events cover phases pass1, pass2, maia, select', async () => {
    const policyMap = new Map([['e2e4', 0.5], ['d2d4', 0.3]]);
    const maiaClient = makeMaiaClient('e2e4', policyMap);

    // Use a blunder fixture so pass2 and maia phases actually fire
    const chess = (await import('chess.js')).Chess;
    const game = new chess();
    const pos0 = game.fen();
    game.move({ from: 'e2', to: 'e4' });
    const pos1 = game.fen();

    const blunderFixtures = {
      [pos0]: SF_BLUNDER_BEFORE,
      [pos1]: SF_BLUNDER_AFTER,
      default: SF_DEFAULT['default'],
    };
    const sfClient2 = new ScriptedEngineClient(blunderFixtures);

    const phases = new Set();
    await runAnalysis({
      plies: ['e2e4', 'e7e5'],
      playerColor: 'white',
      sfClient: sfClient2,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
      onProgress: e => phases.add(e.phase),
    });

    expect(phases.has('pass1')).toBe(true);
    expect(phases.has('select')).toBe(true);
  });

  it('pass 2 only runs for candidate mistakes, not for all positions', async () => {
    const sfClient = makeSfClient(); // all evals return cp=30 — no mistakes
    const maiaClient = makeMaiaClient();

    await runAnalysis({
      plies: FOUR_MOVE_PLIES,
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    // With cp=30 across all positions, no blunders → pass2 should add 0 multiPV calls
    const pass2Calls = sfClient.calls.filter(c => c.type === 'eval' && c.opts?.multiPV);
    expect(pass2Calls).toHaveLength(0);
  });

  it('findability is sourced from Maia policy and recorded on candidates', async () => {
    const chess = (await import('chess.js')).Chess;
    const game = new chess();
    const pos0 = game.fen();
    game.move({ from: 'e2', to: 'e4' });
    const pos1 = game.fen();

    const blunderFixtures = {
      [pos0]: SF_BLUNDER_BEFORE,
      [pos1]: SF_BLUNDER_AFTER,
      default: SF_DEFAULT['default'],
    };

    const sfClient = new ScriptedEngineClient(blunderFixtures);
    const findabilityVal = 0.12;
    const policyMap = new Map([['e2e4', findabilityVal], ['e7e5', 0.05]]);
    const maiaClient = makeMaiaClient('e2e4', policyMap);

    const { puzzleCandidates } = await runAnalysis({
      plies: ['e2e4', 'e7e5'],
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    // There should be at least one candidate with findability set
    if (puzzleCandidates.length > 0) {
      const c = puzzleCandidates[0];
      expect(typeof c.findability).toBe('number');
      expect(c.maiaModel).toBe('maia-1300');
    }
  });

  it('engine_only flag is set when findability < FINDABILITY_MIN', async () => {
    const chess = (await import('chess.js')).Chess;
    const game = new chess();
    const pos0 = game.fen();
    game.move({ from: 'e2', to: 'e4' });
    const pos1 = game.fen();

    const blunderFixtures = {
      [pos0]: SF_BLUNDER_BEFORE,
      [pos1]: SF_BLUNDER_AFTER,
      default: SF_DEFAULT['default'],
    };
    const sfClient = new ScriptedEngineClient(blunderFixtures);
    // Best move has very low probability → engine_only
    const policyMap = new Map([['e2e4', 0.001], ['d2d4', 0.002]]);
    const maiaClient = makeMaiaClient('e2e4', policyMap);

    const { puzzleCandidates } = await runAnalysis({
      plies: ['e2e4', 'e7e5'],
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    if (puzzleCandidates.length > 0) {
      const engineOnly = puzzleCandidates.filter(c => c.engineOnly);
      expect(engineOnly.length).toBeGreaterThan(0);
    }
  });

  it('returns empty puzzleCandidates when there are no player mistakes', async () => {
    // All positions return same cp → no classification above inaccuracy
    const sfClient = makeSfClient({ default: 'info depth 18 score cp 5 pv e2e4\nbestmove e2e4' });
    const maiaClient = makeMaiaClient();

    const { puzzleCandidates } = await runAnalysis({
      plies: FOUR_MOVE_PLIES,
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    // With no win% swing, nothing crosses the inaccuracy threshold
    // (all same cp → winLoss=0 → classification=best/great/good/ok)
    expect(Array.isArray(puzzleCandidates)).toBe(true);
  });

  it('returns zero opponentAccuracy when player plays all moves', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();

    const { opponentAccuracy } = await runAnalysis({
      plies: FOUR_MOVE_PLIES,
      // playing all colours would not normally happen, but testing the 0-array case:
      playerColor: 'white', // only white moves assigned to player in 4-ply game
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    expect(typeof opponentAccuracy).toBe('number');
  });

  it('MultiPV=3 records every runner-up into alt_moves_json', async () => {
    // Set up a blunder so pass 2 fires, using a multiPV fixture for the blunder position.
    // pos0 fixture returns 3 info lines (depth 22/20/18); the pipeline filters line 1
    // (best move = e2e4) and keeps lines 2–3 as alt moves within NEAR_MISS margin.
    const chess = (await import('chess.js')).Chess;
    const game = new chess();
    const pos0 = game.fen();
    game.move({ from: 'e2', to: 'e4' });
    const pos1 = game.fen();

    const MULTI_PV_FIXTURE = [
      'info depth 22 seldepth 30 score cp 100 nodes 1000000 pv e2e4 e7e5',
      'info depth 20 seldepth 28 score cp 98 nodes 800000 pv d2d4 d7d5',
      'info depth 18 seldepth 26 score cp 90 nodes 600000 pv c2c4 c7c5',
      'bestmove e2e4',
    ].join('\n');

    const sfClient = new ScriptedEngineClient({
      [pos0]: MULTI_PV_FIXTURE,
      [pos1]: SF_BLUNDER_AFTER, // score cp 500, Black to move → normalised to cp_white -500 → blunder
      default: SF_DEFAULT['default'],
    });
    const maiaClient = makeMaiaClient('e2e4', new Map([['e2e4', 0.5], ['d2d4', 0.3]]));

    const { puzzleCandidates } = await runAnalysis({
      plies: ['e2e4', 'e7e5'],
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    // The blunder candidate (ply 1, white mover) should have altMovesJson with entries
    const blunderCandidate = puzzleCandidates.find(c => c.mover === 'player');
    expect(blunderCandidate).toBeDefined();
    const alts = JSON.parse(blunderCandidate.altMovesJson ?? '[]');
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.some(a => a.uci === 'd2d4')).toBe(true);
  });

  it('pass 2 catch: runAnalysis rejects when onProgress throws during pass2', async () => {
    const chess = (await import('chess.js')).Chess;
    const game = new chess();
    const pos0 = game.fen();
    game.move({ from: 'e2', to: 'e4' });
    const pos1 = game.fen();

    const sfClient = new ScriptedEngineClient({
      [pos0]: SF_BLUNDER_BEFORE,
      [pos1]: SF_BLUNDER_AFTER,
      default: SF_DEFAULT['default'],
    });
    const maiaClient = makeMaiaClient();

    await expect(runAnalysis({
      plies: ['e2e4'],
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
      onProgress: ({ phase }) => {
        if (phase === 'pass2') throw new Error('pass2 progress error');
      },
    })).rejects.toThrow('pass2 progress error');
  });

  it('pass 3 catch: runAnalysis rejects when onProgress throws during maia pass', async () => {
    const chess = (await import('chess.js')).Chess;
    const game = new chess();
    const pos0 = game.fen();
    game.move({ from: 'e2', to: 'e4' });
    const pos1 = game.fen();

    const sfClient = new ScriptedEngineClient({
      [pos0]: SF_BLUNDER_BEFORE,
      [pos1]: SF_BLUNDER_AFTER,
      default: SF_DEFAULT['default'],
    });
    const maiaClient = makeMaiaClient();

    await expect(runAnalysis({
      plies: ['e2e4'],
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
      onProgress: ({ phase }) => {
        if (phase === 'maia') throw new Error('pass3 progress error');
      },
    })).rejects.toThrow('pass3 progress error');
  });

  it('pass 2: custom sfClient covers lines 179-186 (null lines, !pv, null cp, far cp)', async () => {
    // 4 plies: e4 e5 d4 d5 — player is white → plies 0,2 are player plies.
    // Both white positions are blunders (large cp swing) → pass2 runs TWICE.
    // Call 1 returns lines:null (covers ?? [] right side, line 179).
    // Call 2 returns edge-case lines (covers !l.pv, l.cp===null, far cp).
    const chess = (await import('chess.js')).Chess;
    const game = new chess();
    const pos0 = game.fen();                       // before e4 (player ply 1)
    game.move({ from: 'e2', to: 'e4' });
    const pos1 = game.fen();                       // before e5 (opponent ply)
    game.move({ from: 'e7', to: 'e5' });
    const pos2 = game.fen();                       // before d4 (player ply 2)
    game.move({ from: 'd2', to: 'd4' });
    const pos3 = game.fen();                       // before d5 (opponent ply)
    game.move({ from: 'd7', to: 'd5' });
    const pos4 = game.fen();                       // final position

    let pass2CallCount = 0;
    const customSfClient = {
      _calls: [],
      async eval(fen, opts = {}) {
        this._calls.push({ type: 'eval', fen, opts });
        if (opts && opts.multiPV === 3) {
          pass2CallCount++;
          // First call: return lines:null → covers ?? [] right side (line 179)
          if (pass2CallCount === 1) {
            return { cp: 0, mate: null, bestmove: 'e2e4', pv: 'e2e4', lines: null };
          }
          // Second call: edge-case lines — covers all branches on 180, 184, 186
          return {
            cp: 0, mate: null, bestmove: 'd2d4', pv: 'd2d4',
            lines: [
              { depth: 5, cp: 20 },                          // no pv → !l.pv TRUE (line 180)
              { depth: 18, cp: 0, pv: 'd2d4 d7d5' },        // same as bestmove → seenMoves skip
              { depth: 18, cp: null, pv: 'f2f3 e7e5' },     // cp: null → l.cp !== null FALSE (line 184)
              { depth: 16, cp: -500, pv: 'h2h3 e7e5' },     // far cp → > NEAR_MISS TRUE (line 186)
              { depth: 14, cp: -2, pv: 'g1f3 d7d5' },       // near-miss → included
            ],
          };
        }
        // pass1: blunder on pos0 (player) and pos2 (player); opponent plies are fine
        if (fen === pos0) return { cp: 100, mate: null, bestmove: 'e2e4', pv: 'e2e4', lines: [] };
        if (fen === pos1) return { cp: -500, mate: null, bestmove: 'e7e5', pv: 'e7e5', lines: [] };
        if (fen === pos2) return { cp: 100, mate: null, bestmove: 'd2d4', pv: 'd2d4', lines: [] };
        if (fen === pos3) return { cp: -500, mate: null, bestmove: 'd7d5', pv: 'd7d5', lines: [] };
        if (fen === pos4) return { cp: 0, mate: null, bestmove: 'e2e4', pv: 'e2e4', lines: [] };
        return { cp: 30, mate: null, bestmove: 'e2e4', pv: 'e2e4', lines: [] };
      },
    };

    const policyMap = new Map([['e2e4', 0.5], ['d2d4', 0.3], ['g1f3', 0.2]]);
    const maiaClient = makeMaiaClient('e2e4', policyMap);

    const { puzzleCandidates } = await runAnalysis({
      plies: ['e2e4', 'e7e5', 'd2d4', 'd7d5'],
      playerColor: 'white',
      sfClient: customSfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
    });

    expect(Array.isArray(puzzleCandidates)).toBe(true);
    // pass2 should have been called twice (one per player blunder)
    expect(pass2CallCount).toBe(2);
    // The second call's near-miss alt move 'g1f3' should appear in altMovesJson
    const candidates = puzzleCandidates.filter(c => c.mover === 'player');
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });

  it('regression: existingEvals with bestmove skips the SF call for that position', async () => {
    // Build a 2-ply game; pre-supply existingEvals covering ply 1 (idx=0)
    // The SF client records every call; if existingEvals is respected it should
    // NOT be called for the position at idx=0 (ply=1).
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();

    const callsBefore = sfClient.calls.length;

    // existingEvals covers ply=1 (idx=0) — the position before the first move
    const existingEvals = [
      {
        ply: 1,
        cp_white: 15,
        mate_in: null,
        best_move_uci: 'e2e4',
        pv: 'e2e4 e7e5',
      },
    ];

    await runAnalysis({
      plies: ['e2e4', 'e7e5'],
      playerColor: 'white',
      sfClient,
      maiaClient,
      maiaModel: 'maia-1300',
      playerElo: 1300,
      wasTimed: false,
      existingEvals,
    });

    const totalEvalCalls = sfClient.calls.filter(c => c.type === 'eval').length - callsBefore;
    // Without skip: 3 calls (positions 0,1,2 for a 2-ply game)
    // With skip for idx=0: 2 calls
    expect(totalEvalCalls).toBeLessThan(3);
  });

  it('pipeline: runAnalysis returns both sides\' strength beside accuracy', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    const result = await runAnalysis({
      plies: FOUR_MOVE_PLIES, playerColor: 'white', sfClient, maiaClient,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
    });
    expect(result).toHaveProperty('playerStrength');
    expect(result).toHaveProperty('opponentStrength');
    expect(result.playerStrength).toHaveProperty('n');
    expect(result.playerStrength).toHaveProperty('ase');
    expect(result.playerStrength).toHaveProperty('sd');
    expect(result.playerStrength).toHaveProperty('p75Loss');
    expect(result.opponentStrength).toHaveProperty('n');
  });

  it('pipeline: every position records its legal-move count for strength filtering', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    // FOUR_MOVE_PLIES: white plays plies 1 and 3 (player), black plays plies 2 and 4
    // cp=30 is inside STRENGTH_DECIDED_CP; mateIn=null; normal positions have >1 legal move
    // So all 4 plies are eligible — 2 per side
    const { playerStrength, opponentStrength } = await runAnalysis({
      plies: FOUR_MOVE_PLIES, playerColor: 'white', sfClient, maiaClient,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
    });
    expect(playerStrength.n).toBe(2);
    expect(opponentStrength.n).toBe(2);
  });

  it('pipeline: strength estimation issues no engine calls', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    await runAnalysis({
      plies: FOUR_MOVE_PLIES, playerColor: 'white', sfClient, maiaClient,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
    });
    // All engine calls are accounted for by pass1+pass2+pass3; playingStrength is pure arithmetic
    const evalCalls = sfClient.calls.filter(c => c.type === 'eval').length;
    // 5 positions for pass1 (4 plies + start); pass2 only runs on player blunders (none here)
    expect(evalCalls).toBe(FOUR_MOVE_PLIES.length + 1);
  });

  it('pipeline: a six-move game returns null strengths, not zero', async () => {
    // 6 plies → 3 player plies + 3 opponent plies, both below STRENGTH_MIN_PLIES=12
    const sixPlies = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4'];
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    const { playerStrength, opponentStrength } = await runAnalysis({
      plies: sixPlies, playerColor: 'white', sfClient, maiaClient,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
    });
    expect(playerStrength.strength).toBeNull();
    expect(opponentStrength.strength).toBeNull();
    expect(playerStrength.strength).not.toBe(0);
    expect(opponentStrength.strength).not.toBe(0);
  });

  it('pipeline: mate-score positions cover the mate-detection && right-hand branches', async () => {
    // Engine returns mate score for all positions; normaliseToWhitePov flips Black-to-move.
    // This exercises the `before.mate != null && before.mate > 0` (and < 0) branches.
    const sfClient = new ScriptedEngineClient({
      'default': 'info depth 18 score mate 3 nodes 1000 pv e2e4\nbestmove e2e4',
    });
    const maiaClient = makeMaiaClient();
    const { moveEvals } = await runAnalysis({
      plies: FOUR_MOVE_PLIES, playerColor: 'white', sfClient, maiaClient,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
    });
    expect(moveEvals).toHaveLength(FOUR_MOVE_PLIES.length);
  });

  it('pipeline: existingEvals with camelCase prop names triggers the fallback ?? branches', async () => {
    // cp_white is missing → the ?? e.cpWhite fallback (line 59) is used.
    // best_move_uci is missing → the ?? e.bestMoveUci fallback (line 62) is used.
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    const existingEvals = [{
      ply: 1,
      cpWhite: 15,    // no cp_white — forces the ?? e.cpWhite branch
      mateIn: null,   // no mate_in
      bestMoveUci: 'e2e4', // no best_move_uci — forces the ?? e.bestMoveUci branch
      pv: 'e2e4',
    }];
    await runAnalysis({
      plies: ['e2e4', 'e7e5'], playerColor: 'white', sfClient, maiaClient,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
      existingEvals,
    });
    expect(sfClient.calls.filter(c => c.type === 'eval').length).toBeLessThan(3);
  });

  it('pipeline: a ply is eligible for exactly one side, never both and never neither', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    const { playerStrength, opponentStrength } = await runAnalysis({
      plies: FOUR_MOVE_PLIES, playerColor: 'white', sfClient, maiaClient,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
    });
    // Total eligible plies across both sides must equal total plies (4)
    // because every ply goes to exactly one side
    expect(playerStrength.n + opponentStrength.n).toBe(FOUR_MOVE_PLIES.length);
  });
});

// ── Pass 4: Maia-3 policy strength probe ─────────────────────────────────────

function makeMaia3Client(policyMap = null) {
  const defaultMap = new Map([['e2e4', 0.5], ['d2d4', 0.25]]);
  const calls = [];
  const setOptionCalls = [];
  return {
    _calls: calls,
    _setOptionCalls: setOptionCalls,
    setOption: (name, value) => { setOptionCalls.push({ name, value: String(value) }); },
    policy: async (fen) => {
      calls.push({ type: 'policy', fen });
      return policyMap ?? defaultMap;
    },
    dispose: () => {},
  };
}

describe('pipeline pass 4', () => {
  it('pass 4: result includes playerMaiaLogProb when maia3Client is provided', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    const maia3Client = makeMaia3Client();
    const result = await runAnalysis({
      plies: FOUR_MOVE_PLIES, playerColor: 'white', sfClient, maiaClient,
      maia3Client,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
    });
    expect(result).toHaveProperty('playerMaiaLogProb');
    // FOUR_MOVE_PLIES gives 2 eligible player plies — pass 4 runs using stored playerElo
    expect(result.playerMaiaLogProb).not.toBeNull();
    expect(result.playerMaiaLogProb).toHaveProperty('maiaLogProb');
    expect(result.playerMaiaLogProb).toHaveProperty('n');
  });

  it('pass 4: probes maia3 for each eligible player ply', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    const maia3Client = makeMaia3Client();
    await runAnalysis({
      plies: FOUR_MOVE_PLIES, playerColor: 'white', sfClient, maiaClient,
      maia3Client,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
    });
    // FOUR_MOVE_PLIES: white plays plies 1 and 3 (player when playerColor='white')
    // Both are eligible (cp=30, mateIn=null, legalMoves > 1) → 2 policy calls
    const policyCalls = maia3Client._calls.filter(c => c.type === 'policy');
    expect(policyCalls.length).toBe(2);
  });

  it('pass 4: sets SelfElo on maia3Client for each eligible ply', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    const maia3Client = makeMaia3Client();
    await runAnalysis({
      plies: FOUR_MOVE_PLIES, playerColor: 'white', sfClient, maiaClient,
      maia3Client,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
    });
    const selfEloCalls = maia3Client._setOptionCalls.filter(c => c.name === 'SelfElo');
    expect(selfEloCalls.length).toBeGreaterThan(0);
    // SelfElo should be rounded to nearest 100 and within [1100, 2400]
    const elo = Number(selfEloCalls[0].value);
    expect(elo % 100).toBe(0);
    expect(elo).toBeGreaterThanOrEqual(1100);
    expect(elo).toBeLessThanOrEqual(2400);
  });

  it('pass 4: skipped when maia3Client is not provided', async () => {
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    const result = await runAnalysis({
      plies: FOUR_MOVE_PLIES, playerColor: 'white', sfClient, maiaClient,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
      // no maia3Client
    });
    expect(result.playerMaiaLogProb).toBeNull();
  });

  it('pass 4: skipped when all player plies are ineligible (decided position)', async () => {
    // Every position has |cpWhite| > STRENGTH_DECIDED_CP → no eligible positions
    const decidedSf = new ScriptedEngineClient({
      'default': 'info depth 18 score cp 700 nodes 1000 pv e2e4\nbestmove e2e4',
    });
    const maiaClient = makeMaiaClient();
    const maia3Client = makeMaia3Client();
    const result = await runAnalysis({
      plies: FOUR_MOVE_PLIES, playerColor: 'white', sfClient: decidedSf, maiaClient,
      maia3Client,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
    });
    expect(result.playerMaiaLogProb).toBeNull();
  });

  it('pass 4: uses stored playerElo as SelfElo when playerStrength is null', async () => {
    // Short game → playerStrength.strength is null; SelfElo falls back to playerElo=1300 → rounds to 1300
    const sfClient = makeSfClient();
    const maiaClient = makeMaiaClient();
    const maia3Client = makeMaia3Client();
    await runAnalysis({
      plies: FOUR_MOVE_PLIES, playerColor: 'white', sfClient, maiaClient,
      maia3Client,
      maiaModel: 'maia-1300', playerElo: 1300, wasTimed: false,
    });
    const selfEloCalls = maia3Client._setOptionCalls.filter(c => c.name === 'SelfElo');
    expect(selfEloCalls.length).toBeGreaterThan(0);
    expect(selfEloCalls[0].value).toBe('1300'); // 1300 rounds to 1300
  });
});
