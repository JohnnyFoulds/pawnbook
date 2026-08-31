/**
 * @module public/js/stats
 * Stats page: ELO sparkline, retired-mistakes tile (R35), results tile,
 * queue health meter (R11: due / DUE_SOFT_CAP), rating chart, phase bars,
 * quality mix breakdown bar. Time-range filter scopes all charts.
 *
 * Queue health meter: due / DUE_SOFT_CAP (not due / total).
 * A meter growing the wrong way (R11 finding) is fixed by this ratio.
 */

import { drawSparkline, drawActivityBars, renderBreakdownBar, renderQueueMeter } from './lib/chart.js';
import { QUALITY } from '/shared/quality.js';

const BASE = '';
const DUE_SOFT_CAP = 40;

async function api(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

let currentRange = 'all';

async function boot() {
  try {
    const [stats, state] = await Promise.all([
      api('/api/stats'),
      api('/api/state').catch(() => ({})),
    ]);

    const dueCount = state.dueCount ?? 0;
    document.querySelectorAll('#due-count').forEach((el) => {
      el.textContent = dueCount > DUE_SOFT_CAP ? `${DUE_SOFT_CAP}+` : String(dueCount);
    });

    renderAll(stats, state);

    // Time filter
    document.getElementById('time-filter').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-range]');
      if (!btn) return;
      currentRange = btn.dataset.range;
      document.querySelectorAll('#time-filter [data-range]').forEach((b) =>
        b.classList.toggle('btn--ghost-active', b === btn));
      renderAll(stats, state);
    });

    // Quality breakdown table toggle
    document.getElementById('quality-table-toggle').addEventListener('click', () => {
      const wrap = document.getElementById('quality-table-wrap');
      const visible = wrap.style.display !== 'none';
      wrap.style.display = visible ? 'none' : '';
    });
  } catch (err) {
    console.error('Stats error:', err);
  }
}

const MOTIF_LABEL = {
  hanging_piece: 'hanging piece',
  fork: 'fork',
  back_rank: 'back rank',
  missed_capture: 'missed capture',
  overloaded_defender: 'overloaded defender',
  pinned_piece: 'pin',
  skewer: 'skewer',
  discovered_attack: 'discovered attack',
};

const DIMENSION_LABEL = {
  tactics: 'tactics',
  defense: 'defensive awareness',
};

function renderStyleTile(stats) {
  const tile = document.getElementById('style-tile');
  const valEl = document.getElementById('style-val');
  const deltaEl = document.getElementById('style-delta');
  if (stats.rollingStyleScore == null) { tile.style.display = 'none'; return; }
  tile.style.display = '';
  valEl.textContent = `${stats.rollingStyleScore}%`;
  deltaEl.textContent = 'avg last 10 games · higher = more on-style';
}

function renderStrengthTile(stats) {
  const tile = document.getElementById('strength-tile');
  if (stats.rollingStrength == null) { tile.style.display = 'none'; return; }
  tile.style.display = '';
  document.getElementById('strength-val').textContent = String(stats.rollingStrength);
  const se = stats.rollingSe ?? null;
  document.getElementById('strength-delta').textContent = se != null
    ? `±${se} · from move quality`
    : 'from move quality';
  const canvas = document.getElementById('spark-strength');
  const history = stats.strengthHistory ?? [];
  if (canvas && history.length >= 2) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = (canvas.offsetWidth || 120) * dpr;
    canvas.height = (canvas.offsetHeight || 28) * dpr;
    drawSparkline(canvas, history.map(h => h.strengthElo));
  } else if (canvas) {
    canvas.style.display = 'none';
  }
}

function renderAccuracyTrendTile(stats) {
  const tile = document.getElementById('accuracy-trend-tile');
  const history = stats.accuracyHistory ?? [];
  if (!history.length) { tile.style.display = 'none'; return; }
  tile.style.display = '';
  const recent = history.slice(-10);
  const avg = Math.round(recent.reduce((s, h) => s + h.accuracy, 0) / recent.length);
  document.getElementById('accuracy-trend-val').textContent = `${avg}%`;
  const window7 = history.slice(-7);
  const window14 = history.slice(-14, -7);
  let arrow = '';
  if (window7.length >= 3 && window14.length >= 3) {
    const avg7 = window7.reduce((s, h) => s + h.accuracy, 0) / window7.length;
    const avg14 = window14.reduce((s, h) => s + h.accuracy, 0) / window14.length;
    arrow = avg7 > avg14 + 1 ? ' ↑' : avg7 < avg14 - 1 ? ' ↓' : ' →';
  }
  document.getElementById('accuracy-trend-delta').textContent =
    `avg last ${recent.length} games${arrow}`;
  const canvas = document.getElementById('spark-accuracy-trend');
  if (canvas && history.length >= 2) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = (canvas.offsetWidth || 120) * dpr;
    canvas.height = (canvas.offsetHeight || 28) * dpr;
    drawSparkline(canvas, history.map(h => h.accuracy));
  } else if (canvas) {
    canvas.style.display = 'none';
  }
}

function renderOpponentStats(stats) {
  const card = document.getElementById('opponent-stats-card');
  const rows = stats.opponentStats ?? [];
  if (!rows.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  document.getElementById('opponent-stats-body').innerHTML = rows.map(o => {
    const winPct = o.played > 0 ? Math.round(100 * o.won / o.played) : 0;
    const accCell = o.avgAccuracy != null ? `${o.avgAccuracy}%` : '—';
    return `<tr>
      <td>${o.opponentId}</td>
      <td class="num">${o.played}</td>
      <td class="num" style="color:var(--good)">${o.won}</td>
      <td class="num" style="color:var(--bad)">${o.lost}</td>
      <td class="num">${o.drawn}</td>
      <td class="num" title="${winPct}% win rate">${accCell}</td>
    </tr>`;
  }).join('');
}

function renderAll(stats, state) {
  renderEloTile(stats, state);
  renderStreakTile(state);
  renderDrillAccuracyTile(stats);
  renderWinRateTile(stats);
  renderAccuracyTrendTile(stats);
  renderStyleTile(stats);
  renderStrengthTile(stats);
  renderRetiredTile(stats);
  renderOpponentStats(stats);
  renderResultsTile(stats);
  renderQueueHealth(stats, state);
  renderEloChart(stats);
  renderPhaseBars(stats);
  renderFocusCard(stats);
  renderWeaknessTile(stats);
  renderQualityMix(stats);
}

function renderWinRateTile(stats) {
  const tile = document.getElementById('win-rate-tile');
  const history = stats.winRateHistory ?? [];
  if (!history.length) { tile.style.display = 'none'; return; }
  tile.style.display = '';

  const totalPlayed = history.reduce((s, d) => s + d.played, 0);
  const totalWon = history.reduce((s, d) => s + d.won, 0);
  const pct = totalPlayed > 0 ? Math.round(100 * totalWon / totalPlayed) : null;
  document.getElementById('win-rate-val').textContent = pct != null ? `${pct}%` : '—';

  const recent = history.slice(-14);
  const recentPlayed = recent.reduce((s, d) => s + d.played, 0);
  const recentWon = recent.reduce((s, d) => s + d.won, 0);
  const recentPct = recentPlayed > 0 ? Math.round(100 * recentWon / recentPlayed) : null;
  const deltaEl = document.getElementById('win-rate-delta');
  if (recentPct != null && pct != null && recentPlayed >= 3) {
    const diff = recentPct - pct;
    deltaEl.textContent = diff > 4 ? '↑ trending up' : diff < -4 ? '↓ trending down' : '→ steady';
  } else {
    deltaEl.textContent = `${totalPlayed} game${totalPlayed === 1 ? '' : 's'}`;
  }

  drawActivityBars(
    document.getElementById('spark-win-rate'),
    history.map(d => d.played > 0 ? Math.round(100 * d.won / d.played) : 0),
  );
}

function renderDrillAccuracyTile(stats) {
  const tile = document.getElementById('drill-accuracy-tile');
  const history = stats.drillHistory ?? [];
  if (!history.length) { tile.style.display = 'none'; return; }
  tile.style.display = '';

  const totalAttempted = history.reduce((s, d) => s + d.attempted, 0);
  const totalCorrect = history.reduce((s, d) => s + d.correct, 0);
  const pct = totalAttempted > 0 ? Math.round(100 * totalCorrect / totalAttempted) : null;
  document.getElementById('drill-accuracy-val').textContent = pct != null ? `${pct}%` : '—';

  const recent = history.slice(-7);
  const recentAttempted = recent.reduce((s, d) => s + d.attempted, 0);
  const recentCorrect = recent.reduce((s, d) => s + d.correct, 0);
  const recentPct = recentAttempted > 0 ? Math.round(100 * recentCorrect / recentAttempted) : null;
  const deltaEl = document.getElementById('drill-accuracy-delta');
  if (recentPct != null && pct != null && recentAttempted >= 3) {
    const diff = recentPct - pct;
    deltaEl.textContent = diff > 2 ? `↑ trending up` : diff < -2 ? `↓ trending down` : `→ steady`;
  } else {
    deltaEl.textContent = `${totalAttempted} drill${totalAttempted === 1 ? '' : 's'}`;
  }

  drawActivityBars(
    document.getElementById('spark-drill-accuracy'),
    history.map(d => d.attempted > 0 ? Math.round(100 * d.correct / d.attempted) : 0),
  );
}

function renderStreakTile(state) {
  const tile = document.getElementById('streak-tile');
  const valEl = document.getElementById('streak-val');
  const pluralEl = document.getElementById('streak-plural');
  const streak = state.streak ?? 0;
  if (!state.showStreak || streak < 1) { tile.style.display = 'none'; return; }
  tile.style.display = '';
  valEl.textContent = String(streak);
  if (pluralEl) pluralEl.textContent = streak === 1 ? '' : 's';
}

function renderFocusCard(stats) {
  const card = document.getElementById('focus-card');
  const textEl = document.getElementById('focus-text');
  const linkEl = document.getElementById('focus-drill-link');
  const focus = stats.focusMotif;
  if (!focus) { card.style.display = 'none'; return; }
  card.style.display = '';
  const label = MOTIF_LABEL[focus.tag] ?? focus.tag.replace(/_/g, ' ');
  const accPart = focus.accuracy != null
    ? ` — you solve these ${focus.accuracy}% of the time`
    : ' — you have not drilled these yet';
  textEl.textContent = `${label} (${focus.mistakes} mistake${focus.mistakes === 1 ? '' : 's'})${accPart}.`;
  linkEl.href = `puzzles.html?motif=${encodeURIComponent(focus.tag)}`;
}

function renderEloTile(stats, state) {
  const elo = state.elo ?? stats.elo ?? 1200;
  document.getElementById('elo-val').textContent = String(elo);
  document.getElementById('elo-delta').textContent =
    stats.eloDelta ? `${stats.eloDelta >= 0 ? '+' : ''}${stats.eloDelta} vs last game` : '';

  const history = filterHistory(stats.eloHistory ?? [], currentRange);
  if (history.length) {
    const canvas = document.getElementById('spark-elo');
    drawSparkline(canvas, history.map((h) => h.elo));
  }
}

function renderRetiredTile(stats) {
  const retired = stats.graduatedCount ?? 0;
  document.getElementById('retired-val').textContent = String(retired);

  const history = filterHistory(stats.retiredHistory ?? [], currentRange);
  if (history.length) {
    const canvas = document.getElementById('spark-retired');
    drawSparkline(canvas, history.map((h) => h.count));
  }
}

function renderResultsTile(stats) {
  const filtered = filterGames(stats, currentRange);
  document.getElementById('wins-val').textContent = String(filtered.wins);
  document.getElementById('losses-val').textContent = String(filtered.losses);
  document.getElementById('draws-val').textContent = String(filtered.draws);
}

function renderQueueHealth(stats, state) {
  const due = state.dueCount ?? stats.dueCount ?? 0;
  const active = stats.activeCount ?? 0;
  const graduated = stats.graduatedCount ?? 0;

  const trackEl = document.getElementById('queue-fill');
  const captionEl = document.getElementById('queue-caption');
  renderQueueMeter(trackEl, captionEl, due, DUE_SOFT_CAP, active, graduated);
}

function renderEloChart(stats) {
  const canvas = document.getElementById('elo-chart');
  const history = filterHistory(stats.eloHistory ?? [], currentRange);
  if (!history.length) return;

  canvas.width = canvas.offsetWidth * window.devicePixelRatio || 700;
  canvas.height = 120 * window.devicePixelRatio;
  canvas.style.width = '100%';
  canvas.style.height = '120px';

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = { t: 8, b: 24, l: 40, r: 8 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const vals = history.map((h) => h.elo);
  const minV = Math.min(...vals) - 30;
  const maxV = Math.max(...vals) + 30;
  const px = (i) => PAD.l + (i / (vals.length - 1 || 1)) * chartW;
  const py = (v) => PAD.t + ((maxV - v) / (maxV - minV)) * chartH;

  const tokens = getComputedStyle(document.documentElement);
  const accent = tokens.getPropertyValue('--accent').trim() || '#3987e5';
  const gridline = tokens.getPropertyValue('--gridline').trim() || '#2c2c2a';
  const inkMuted = tokens.getPropertyValue('--ink-muted').trim() || '#898781';

  // Gridlines
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = minV + ((maxV - minV) / steps) * i;
    const y = py(v);
    ctx.strokeStyle = gridline;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + chartW, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = inkMuted;
    ctx.font = `${10 * window.devicePixelRatio}px system-ui,sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(v), PAD.l - 4, y + 3);
  }

  // Line
  ctx.beginPath();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  vals.forEach((v, i) => {
    i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v));
  });
  ctx.stroke();

  // End marker
  const last = vals[vals.length - 1];
  ctx.beginPath();
  ctx.arc(px(vals.length - 1), py(last), 4, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
}

function renderPhaseBars(stats) {
  const phases = filterPhases(stats, currentRange);
  const container = document.getElementById('phase-bars');
  const max = Math.max(...Object.values(phases), 1);

  container.innerHTML = ['opening', 'middlegame', 'endgame'].map((phase) => {
    const n = phases[phase] ?? 0;
    const pct = (n / max) * 100;
    return `<div style="display:flex;align-items:center;gap:12px">
      <div style="width:100px;font-size:13px;color:var(--ink-secondary)">${phase}</div>
      <div style="flex:1;height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:4px"></div>
      </div>
      <div style="width:28px;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${n}</div>
    </div>`;
  }).join('');
}

function renderWeaknessTile(stats) {
  const card = document.getElementById('weakness-card');
  const dimEl = document.getElementById('dimension-text');
  const textEl = document.getElementById('weakness-text');
  const barsEl = document.getElementById('weakness-bars');

  const counts = filterMotifs(stats, currentRange);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  if (!total) { card.style.display = 'none'; return; }

  card.style.display = '';

  // Dimension summary line
  const MOTIF_DIM = { hanging_piece: 'tactics', fork: 'tactics', missed_capture: 'tactics', back_rank: 'defense', overloaded_defender: 'defense', pinned_piece: 'tactics', skewer: 'tactics', discovered_attack: 'tactics' };
  const dimCounts = {};
  for (const [tag, n] of Object.entries(counts)) {
    const d = MOTIF_DIM[tag];
    if (d) dimCounts[d] = (dimCounts[d] || 0) + n;
  }
  const dimSorted = Object.entries(dimCounts).sort((a, b) => b[1] - a[1]);
  if (dimSorted.length) {
    const [topDim, topDimCount] = dimSorted[0];
    const dimLabel = DIMENSION_LABEL[topDim] ?? topDim;
    dimEl.textContent = `${topDimCount} of your ${total} mistake${total === 1 ? '' : 's'} ${topDimCount === 1 ? 'was a' : 'were'} ${dimLabel} problem${topDimCount === 1 ? '' : 's'}.`;
  } else {
    dimEl.textContent = '';
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topTag, topCount] = sorted[0];
  const label = MOTIF_LABEL[topTag] ?? topTag.replace(/_/g, ' ');
  textEl.innerHTML =
    `Top pattern: ${label} (${topCount}). &nbsp;<a href="puzzles.html?motif=${encodeURIComponent(topTag)}" style="color:var(--accent);font-size:12px">Drill this →</a>`;

  const max = topCount;
  const accuracy = stats.motifAccuracy ?? {};
  barsEl.innerHTML = sorted.map(([tag, n]) => {
    const lbl = MOTIF_LABEL[tag] ?? tag.replace(/_/g, ' ');
    const pct = (n / max) * 100;
    const acc = accuracy[tag];
    const accHtml = acc && acc.total > 0
      ? `<span style="font-size:11px;color:var(--ink-muted);white-space:nowrap" title="${acc.correct}/${acc.total} first-attempt correct">${Math.round((acc.correct / acc.total) * 100)}%</span>`
      : '';
    return `<div style="display:flex;align-items:center;gap:12px">
      <div style="width:120px;font-size:13px;color:var(--ink-secondary)">${lbl}</div>
      <div style="flex:1;height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:4px"></div>
      </div>
      <div style="width:28px;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${n}</div>
      ${accHtml}
      <a href="puzzles.html?motif=${encodeURIComponent(tag)}" style="font-size:11px;color:var(--ink-muted);white-space:nowrap" title="Drill only ${lbl}">drill →</a>
    </div>`;
  }).join('');
}

function renderQualityMix(stats) {
  const counts = filterQuality(stats, currentRange);
  renderBreakdownBar(document.getElementById('quality-bar'), counts);

  const tbody = document.getElementById('quality-table-body');
  const total = Object.values(counts).reduce((s, n) => s + n, 0) || 1;
  tbody.innerHTML = Object.entries(QUALITY).map(([key, tier]) => {
    const n = counts[key] || 0;
    return `<tr>
      <td>${tier.label}</td>
      <td class="num">${n}</td>
      <td class="num">${Math.round((n / total) * 100)}%</td>
    </tr>`;
  }).join('');
}

// ── Range helpers ──────────────────────────────────────────────────────────

function cutoff(range) {
  if (range === 'all') return new Date(0);
  const days = parseInt(range);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function filterHistory(history, range) {
  if (range === 'all') return history;
  const from = cutoff(range);
  return history.filter((h) => new Date(h.recordedAt) >= from);
}

function filterGames(stats, range) {
  if (range === 'all') {
    return { wins: stats.wins ?? 0, losses: stats.losses ?? 0, draws: stats.draws ?? 0 };
  }
  const from = cutoff(range);
  const games = (stats.gameHistory ?? []).filter((g) => new Date(g.playedAt) >= from);
  return {
    wins: games.filter((g) => g.result === 'win').length,
    losses: games.filter((g) => g.result === 'loss').length,
    draws: games.filter((g) => g.result === 'draw').length,
  };
}

function filterPhases(stats, range) {
  if (range === 'all') return stats.phaseBreakdown ?? {};
  const from = cutoff(range);
  const evals = (stats.mistakesByPhase ?? []).filter((m) => new Date(m.createdAt) >= from);
  const out = {};
  evals.forEach((m) => { out[m.phase] = (out[m.phase] || 0) + 1; });
  return out;
}

function filterQuality(stats, range) {
  if (range === 'all') return stats.qualityMix ?? {};
  const from = cutoff(range);
  const evals = (stats.allMoves ?? []).filter((m) => new Date(m.createdAt) >= from);
  const out = {};
  evals.forEach((m) => { out[m.classification] = (out[m.classification] || 0) + 1; });
  return out;
}

function filterMotifs(stats, range) {
  if (range === 'all') return stats.motifBreakdown ?? {};
  const from = cutoff(range);
  const mistakes = (stats.mistakesByMotif ?? []).filter((m) => new Date(m.createdAt) >= from);
  const out = {};
  mistakes.forEach((m) => { out[m.motifTag] = (out[m.motifTag] || 0) + 1; });
  return out;
}

boot();
