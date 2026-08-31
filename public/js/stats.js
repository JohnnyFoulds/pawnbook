/**
 * @module public/js/stats
 * Stats page: ELO sparkline, retired-mistakes tile (R35), results tile,
 * queue health meter (R11: due / DUE_SOFT_CAP), rating chart, phase bars,
 * quality mix breakdown bar. Time-range filter scopes all charts.
 *
 * Queue health meter: due / DUE_SOFT_CAP (not due / total).
 * A meter growing the wrong way (R11 finding) is fixed by this ratio.
 */

import { drawSparkline, renderBreakdownBar, renderQueueMeter } from './lib/chart.js';
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

function renderAll(stats, state) {
  renderEloTile(stats, state);
  renderStyleTile(stats);
  renderRetiredTile(stats);
  renderResultsTile(stats);
  renderQueueHealth(stats, state);
  renderEloChart(stats);
  renderPhaseBars(stats);
  renderWeaknessTile(stats);
  renderQualityMix(stats);
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
  const MOTIF_DIM = { hanging_piece: 'tactics', fork: 'tactics', missed_capture: 'tactics', back_rank: 'defense', overloaded_defender: 'defense' };
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
  textEl.textContent =
    `Top pattern: ${label} (${topCount}). Keep an eye on these in your drill queue.`;

  const max = topCount;
  barsEl.innerHTML = sorted.map(([tag, n]) => {
    const lbl = MOTIF_LABEL[tag] ?? tag.replace(/_/g, ' ');
    const pct = (n / max) * 100;
    return `<div style="display:flex;align-items:center;gap:12px">
      <div style="width:120px;font-size:13px;color:var(--ink-secondary)">${lbl}</div>
      <div style="flex:1;height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:4px"></div>
      </div>
      <div style="width:28px;font-size:13px;text-align:right;font-variant-numeric:tabular-nums">${n}</div>
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
