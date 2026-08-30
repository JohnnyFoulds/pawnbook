/**
 * @module tui/screens/repertoire
 * Repertoire screen: coverage %, book moves, candidates, open challenges,
 * top coverage gaps, and recent changelog entries.
 *
 * Usage: chess repertoire
 *
 * The screen is read-only — it fetches from the REST API and renders.
 * No game logic runs here; all data is computed server-side.
 */

import { BOLD, RESET } from '../theme.js';

/**
 * @param {object} opts
 * @param {string} opts.host
 * @param {Function} opts.apiCall
 * @returns {{ boot: Function, render: Function }}
 */
export function createRepertoireScreen({ host, apiCall }) {
  const state = {
    coverage: null,
    changelog: null,
    challenges: null,
    gaps: null,
    error: null,
    loaded: false,
  };

  /** Fetch all repertoire data in parallel. */
  async function boot() {
    try {
      const [coverage, changelogData, challengesData, gapsData] = await Promise.all([
        apiCall(host, '/api/repertoire/coverage'),
        apiCall(host, '/api/repertoire/changelog?limit=10'),
        apiCall(host, '/api/repertoire/challenges'),
        apiCall(host, '/api/repertoire/gaps'),
      ]);
      state.coverage   = coverage;
      state.changelog  = changelogData.entries ?? [];
      state.challenges = challengesData.challenges ?? [];
      state.gaps       = gapsData.gaps ?? [];
      state.loaded     = true;
    } catch (err) {
      state.error  = err.message;
      state.loaded = true;
    }
  }

  /** Render the repertoire screen as a string. */
  function render() {
    const lines = [];
    lines.push(BOLD + 'Repertoire' + RESET);
    lines.push('');

    if (state.error) {
      lines.push(`Error: ${state.error}`);
      return lines.join('\n');
    }

    if (!state.loaded) {
      lines.push('Loading…');
      return lines.join('\n');
    }

    const cov = state.coverage;
    if (cov) {
      const pct = cov.coveragePct ?? 0;
      const barW = Math.round(pct / 5);   // 20-char bar for 100%
      const bar = '█'.repeat(barW) + '░'.repeat(20 - barW);
      lines.push(`Coverage   ${String(pct).padStart(3)}%  [${bar}]`);
      lines.push(`           ${cov.coveredNodes ?? 0} positions covered · ${cov.canonicalCount ?? 0} book moves · ${cov.candidateCount ?? 0} candidates · ${cov.totalNodes ?? 0} total`);
    }

    lines.push('');

    const openCount = state.challenges.length;
    lines.push(`Challenges  ${openCount} open`);
    lines.push('');

    // Top gaps (sorted by reachProb desc, returned pre-sorted by server)
    const gaps = state.gaps.slice(0, 5);
    if (gaps.length) {
      lines.push('Top gaps (opponent replies without a book response):');
      for (const g of gaps) {
        const pct = (g.reachProb * 100).toFixed(1);
        lines.push(`  ${String(pct).padStart(5)}%  ${g.opponentReplyUci}`);
      }
    } else {
      lines.push('No significant gaps.');
    }

    lines.push('');

    // Recent changelog
    const log = state.changelog;
    if (log && log.length) {
      lines.push('Recent changes:');
      for (const e of log) {
        const date = new Date(e.at).toLocaleDateString();
        const from = e.fromSan ?? e.fromUci ?? '';
        const to   = e.toSan   ?? e.toUci   ?? '';
        let desc;
        if (e.kind === 'promote')        desc = `${to} replaced ${from}`;
        else if (e.kind === 'settle')    desc = `${from} and ${to} both kept`;
        else if (e.kind === 'reverse')   desc = `Change reversed`;
        else if (e.kind === 'confirm')   desc = `${to || from} confirmed`;
        else if (e.kind === 'elect')     desc = `${to || from} elected`;
        else if (e.kind === 'retire')    desc = `${from || to} retired`;
        else if (e.kind === 'quarantine_exit') desc = `${from || to} exited quarantine`;
        else if (e.kind === 'refuse')    desc = `${from || to} refused`;
        else desc = e.kind;
        lines.push(`  ${date.padEnd(12)} ${desc}`);
      }
    } else {
      lines.push('No book changes yet.');
    }

    lines.push('');
    lines.push(`Full view: http://${host}/repertoire.html`);

    return lines.join('\n');
  }

  return { boot, render };
}
