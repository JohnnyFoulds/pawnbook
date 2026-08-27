import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect } from 'vitest';

import { parsePolicyLines, selectTopLine } from '../../src/adapters/engine/uci-engine-client.js';
import { ScriptedEngineClient } from '../../src/adapters/engine/scripted-engine-client.js';
import { engineMovetime } from '../../src/adapters/engine/engine-pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../fixtures/engine-output');

function loadFixture(name) {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

// ─── policy parser ────────────────────────────────────────────────────────────

describe('uci: VerboseMoveStats parsing', () => {
  it('the parsed policy map size equals the legal-move count (20 at startpos)', () => {
    const text = loadFixture('lc0-maia1500-startpos-policy.txt');
    const map = parsePolicyLines(text.split('\n'));
    expect(map.size).toBe(20);
  });

  it('the "info string node" summary line is discarded from the policy map', () => {
    const text = loadFixture('lc0-maia1500-startpos-policy.txt');
    const map = parsePolicyLines(text.split('\n'));
    expect(map.has('node')).toBe(false);
  });

  it('VerboseMoveStats lines parse into a policy map summing to ~1.0', () => {
    const text = loadFixture('lc0-maia1500-startpos-policy.txt');
    const map = parsePolicyLines(text.split('\n'));
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1.0, 1);
  });

  it('e2e4 has the highest probability in the Maia 1500 startpos policy', () => {
    const text = loadFixture('lc0-maia1500-startpos-policy.txt');
    const map = parsePolicyLines(text.split('\n'));
    const e4prob = map.get('e2e4') ?? 0;
    for (const [move, prob] of map) {
      if (move !== 'e2e4') expect(e4prob).toBeGreaterThanOrEqual(prob);
    }
  });
});

// ─── info line parsing via ScriptedEngineClient ───────────────────────────────

describe('uci: info line parsing', () => {
  it('info lines parse into {depth, cp, mate, bestmove, pv}', () => {
    const fixture = loadFixture('sf-startpos-depth15.txt');
    const client = new ScriptedEngineClient({ default: fixture });
    return client.eval('startpos').then(result => {
      expect(result.cp).toBeTypeOf('number');
      expect(result.bestmove).toMatch(/^[a-h][1-8][a-h][1-8]/);
      expect(result.pv).toContain(result.bestmove.slice(0, 4));
    });
  });

  it('cp scores are normalised to White POV (positive = white better at startpos)', () => {
    const fixture = loadFixture('sf-startpos-depth15.txt');
    const client = new ScriptedEngineClient({ default: fixture });
    return client.eval('startpos').then(result => {
      // Stockfish returns white-POV cp at startpos — should be slightly positive
      expect(result.cp).toBeGreaterThan(0);
    });
  });
});

// ─── ScriptedEngineClient ─────────────────────────────────────────────────────

describe('scripted engine client', () => {
  it('replays fixture output identically to the parsed real output', () => {
    const fixture = loadFixture('sf-startpos-depth15.txt');
    const client = new ScriptedEngineClient({ default: fixture });
    return client.eval('any-fen').then(result => {
      expect(result.bestmove).toBeTruthy();
      expect(typeof result.cp).toBe('number');
    });
  });

  it('policy() returns a Map with probability values', async () => {
    const fixture = loadFixture('lc0-maia1500-startpos-policy.txt');
    const client = new ScriptedEngineClient({ 'policy-default': fixture });
    const map = await client.policy('any-fen');
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBeGreaterThan(0);
  });

  it('records all calls for assertion in tests', async () => {
    const client = new ScriptedEngineClient();
    await client.eval('fen1');
    await client.policy('fen2');
    expect(client.calls).toHaveLength(2);
    expect(client.calls[0].type).toBe('eval');
    expect(client.calls[1].type).toBe('policy');
  });
});

// ─── selectTopLine (MultiPV top-line selection) ───────────────────────────────

describe('uci: selectTopLine', () => {
  it('with multiPV=1 returns the first line at max depth', () => {
    const lines = [
      { depth: 18, cp: 30, multipv: undefined },
      { depth: 15, cp: 50 },
    ];
    const top = selectTopLine(lines, 1);
    expect(top.depth).toBe(18);
    expect(top.cp).toBe(30);
  });

  it('with multiPV>1 returns the multipv===1 line at max depth', () => {
    const lines = [
      { depth: 18, cp: 30, multipv: 2 },  // runner-up at max depth
      { depth: 18, cp: 50, multipv: 1 },  // best line at max depth
      { depth: 15, cp: 60, multipv: 1 },  // shallower
    ];
    const top = selectTopLine(lines, 3);
    expect(top.cp).toBe(50);
    expect(top.multipv).toBe(1);
  });

  it('with multiPV>1 falls back to first line if no multipv===1 present', () => {
    const lines = [
      { depth: 18, cp: 25, multipv: 2 },
      { depth: 18, cp: 10, multipv: 3 },
    ];
    const top = selectTopLine(lines, 3);
    expect(top.depth).toBe(18);
    expect(top.cp).toBe(25); // first at max depth
  });

  it('returns empty object for empty input', () => {
    expect(selectTopLine([], 1)).toEqual({});
  });
});

// ─── engineMovetime (clock-aware movetime cap) ────────────────────────────────

describe('engine pool: engineMovetime', () => {
  function session(overrides = {}) {
    return {
      playerColor: 'white',
      timeControl: null,
      _clockWhiteMs: 180_000,
      _clockBlackMs: 180_000,
      ...overrides,
    };
  }

  it('returns SF_MOVETIME_MS when no time control', () => {
    expect(engineMovetime(session())).toBe(500);
  });

  it('returns SF_MOVETIME_MS when engine has plenty of time', () => {
    const s = session({ timeControl: { initialSec: 180, incSec: 0 } });
    // Engine is black (player is white), black has 180s → 500ms cap applies
    expect(engineMovetime(s)).toBe(500);
  });

  it('caps movetime when engine is running low', () => {
    const s = session({
      timeControl: { initialSec: 10, incSec: 0 },
      _clockBlackMs: 700,  // engine (black) has 700ms left
    });
    // min(700 - 300, 500) = min(400, 500) = 400
    expect(engineMovetime(s)).toBe(400);
  });

  it('returns 100ms floor when engine has almost no time', () => {
    const s = session({
      timeControl: { initialSec: 10, incSec: 0 },
      _clockBlackMs: 50, // engine has 50ms left
    });
    // max(100, 50 - 300) = max(100, -250) = 100
    expect(engineMovetime(s)).toBe(100);
  });

  it('reads engine clock from white when player is black', () => {
    const s = session({
      playerColor: 'black',
      timeControl: { initialSec: 10, incSec: 0 },
      _clockWhiteMs: 600, // engine (white) has 600ms left
      _clockBlackMs: 180_000,
    });
    // min(600 - 300, 500) = min(300, 500) = 300
    expect(engineMovetime(s)).toBe(300);
  });
});
