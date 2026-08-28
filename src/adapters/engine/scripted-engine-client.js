/**
 * @module adapters/engine/scripted-engine-client
 * Replays recorded UCI output from fixture files — no engine binary needed.
 */

import { normaliseToWhitePov } from '../../shared/pov.js';

import { parsePolicyLines } from './uci-engine-client.js';

export class ScriptedEngineClient {
  /**
   * @param {object} fixtures — map of label → raw UCI stdout text
   * @param {object} [opts]
   * @param {string} [opts.defaultBestmove]
   */
  constructor(fixtures = {}, opts = {}) {
    this._fixtures = fixtures;
    this._defaultBestmove = opts.defaultBestmove ?? 'e2e4';
    this._calls = [];
  }

  /**
   * @param {string} fen
   * @param {object} [opts]
   * @param {string} [opts.fixture] — key into fixtures map
   * @returns {Promise<{cp: number|null, mate: number|null, bestmove: string, pv: string, lines: object[]}>}
   */
  async eval(fen, opts = {}) {
    this._calls.push({ type: 'eval', fen, opts });
    const fixture = this._fixtures[opts.fixture ?? fen] ?? this._fixtures['default'];
    const raw = fixture
      ? parseEvalFixture(fixture)
      : { cp: 0, mate: null, bestmove: this._defaultBestmove, pv: this._defaultBestmove, lines: [] };
    return normaliseToWhitePov(fen, raw);
  }

  /**
   * @param {string} fen
   * @param {string} [fixtureKey]
   * @returns {Promise<Map<string, number>>}
   */
  async policy(fen, fixtureKey) {
    this._calls.push({ type: 'policy', fen });
    const key = fixtureKey ?? fen;
    const text = this._fixtures[key] ?? this._fixtures['policy-default'];
    if (text) return parsePolicyLines(text.split('\n'));
    return new Map([['e2e4', 0.5], ['d2d4', 0.25]]);
  }

  /**
   * @param {string} fen
   * @returns {Promise<string>}
   */
  async bestmove(fen) {
    const result = await this.eval(fen);
    return result.bestmove;
  }

  dispose() {}

  /** @returns {object[]} recorded calls (for assertions) */
  get calls() { return this._calls; }
}

/** @param {string} text */
function parseEvalFixture(text) {
  const lines = text.split('\n');
  const infos = [];
  let bestmove = 'e2e4';

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('info ') && l.includes('score') && l.includes('depth')) {
      const parts = l.split(' ');
      const info = {};
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] === 'depth') info.depth = Number(parts[++i]);
        else if (parts[i] === 'score') {
          const type = parts[++i];
          const val = Number(parts[++i]);
          if (type === 'cp') info.cp = val;
          else if (type === 'mate') info.mate = val;
        } else if (parts[i] === 'pv') { info.pv = parts.slice(i + 1).join(' '); break; }
      }
      if (info.depth) infos.push(info);
    } else if (l.startsWith('bestmove ')) {
      bestmove = l.split(' ')[1];
    }
  }

  const top = infos.sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))[0] ?? {};
  return {
    cp: top.cp ?? null,
    mate: top.mate ?? null,
    bestmove,
    pv: top.pv ?? bestmove,
    lines: infos,
  };
}
