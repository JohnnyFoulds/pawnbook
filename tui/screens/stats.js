/**
 * @module tui/screens/stats
 * Stats screen: ELO, rating history, mistakes by phase, queue health.
 *
 * Queue meter shows due / DUE_SOFT_CAP (not due / total).
 * Full charts are available at the browser URL.
 *
 * --no-streak suppresses the streak tile for this session only
 * without altering settings.show_streak in the database.
 */

import { DUE_SOFT_CAP } from '../../src/shared/balance.js';

const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

/**
 * @param {object} opts
 * @param {string} opts.host
 * @param {object} [opts.sessionOpts]
 * @param {boolean} [opts.sessionOpts.noStreak]
 * @param {Function} opts.apiCall
 * @returns {{ boot: Function, render: Function }}
 */
export function createStatsScreen({ host, sessionOpts = {}, apiCall }) {
  const state = {
    stats:  null,
    state:  null,
    error:  null,
    loaded: false,
  };

  async function boot() {
    try {
      const [stats, appState] = await Promise.all([
        apiCall(host, '/api/stats'),
        apiCall(host, '/api/state').catch(() => ({})),
      ]);
      state.stats  = stats;
      state.state  = appState;
      state.loaded = true;
    } catch (err) {
      state.error = String(err.message ?? err);
    }
  }

  function render() {
    const lines = [];

    if (state.error) {
      lines.push('Error: ' + state.error);
      return lines.join('\n');
    }
    if (!state.loaded) {
      lines.push('Loading…');
      return lines.join('\n');
    }

    const { stats, state: appState } = state;
    const elo = appState.elo ?? stats.elo ?? 1200;
    const eloDelta = stats.eloDelta;
    const dueCount = appState.dueCount ?? stats.dueCount ?? 0;
    const activeCount = stats.activeCount ?? 0;
    const graduatedCount = stats.graduatedCount ?? 0;

    // ELO headline
    const deltaStr = eloDelta != null
      ? ` (${eloDelta >= 0 ? '+' : ''}${eloDelta} vs last)`
      : '';
    lines.push(BOLD + `ELO ${elo}` + RESET + deltaStr);
    lines.push('');

    // Rating sparkline (braille blocks approximation using block chars)
    const history = (stats.eloHistory ?? []).slice(-30);
    if (history.length >= 2) {
      const vals = history.map((h) => h.elo);
      lines.push('Rating over time');
      lines.push(sparkBar(vals, 48) + `  ${vals[vals.length - 1]}`);
      lines.push('');
    }

    // Mistakes by phase
    const phases = stats.phaseBreakdown ?? {};
    const maxPhase = Math.max(...Object.values(phases), 1);
    if (Object.keys(phases).length > 0) {
      lines.push('Mistakes by phase');
      for (const ph of ['opening', 'middlegame', 'endgame']) {
        const n = phases[ph] ?? 0;
        const barW = Math.round((n / maxPhase) * 24);
        lines.push(`  ${ph.padEnd(12)} ${'█'.repeat(barW).padEnd(24)}  ${n}`);
      }
      lines.push('');
    }

    // Queue health — due / DUE_SOFT_CAP (not due / total)
    const pct = Math.min(dueCount / DUE_SOFT_CAP, 1);
    const filled = Math.round(pct * 20);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    const dueLabel = dueCount > DUE_SOFT_CAP ? `${DUE_SOFT_CAP}+` : String(dueCount);
    lines.push(`Queue    ${dueLabel} due of ${DUE_SOFT_CAP} comfortable  [${bar}]  ${Math.round(pct * 100)}%`);
    lines.push(`         ${activeCount} active · ${graduatedCount} retired`);
    lines.push('');

    // Results
    const wins   = stats.wins   ?? 0;
    const losses = stats.losses ?? 0;
    const draws  = stats.draws  ?? 0;
    lines.push(`Results  ✓ ${wins} won   ✗ ${losses} lost   = ${draws} drew`);
    lines.push('');

    // Streak (session --no-streak overrides show_streak for this session)
    const showStreak = !sessionOpts.noStreak && (appState.showStreak !== false);
    if (showStreak) {
      const streak = appState.streak ?? 0;
      lines.push(`Streak   ${streak} day${streak === 1 ? '' : 's'}`);
      lines.push('');
    }

    // Browser link for full charts
    lines.push(`Full charts: http://${host}/stats.html`);

    return lines.join('\n');
  }

  return { boot, render };
}

/**
 * Minimal sparkline using block characters.
 * @param {number[]} values
 * @param {number} width
 * @returns {string}
 */
function sparkBar(values, width) {
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = Math.max(1, Math.floor(values.length / width));
  const sampled = [];
  for (let i = 0; i < values.length; i += step) sampled.push(values[i]);
  return sampled.slice(-width).map((v) => {
    const idx = Math.min(7, Math.floor(((v - min) / range) * 8));
    return blocks[idx];
  }).join('');
}
