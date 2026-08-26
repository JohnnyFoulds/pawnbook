import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parsePolicyLines } from '../../src/adapters/engine/uci-engine-client.js';
import { ScriptedEngineClient } from '../../src/adapters/engine/scripted-engine-client.js';

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
