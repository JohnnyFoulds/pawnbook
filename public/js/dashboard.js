/**
 * @module public/js/dashboard
 * Dashboard page: ELO tile, puzzles-due tile, streak tile (when enabled),
 * quick-play and drill CTAs, rating sparkline, recent games.
 */

import { drawSparkline } from './lib/chart.js';

const BASE = '';

async function api(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function init() {
  try {
    const [state, due] = await Promise.all([
      api('/api/state'),
      api('/api/puzzles/due').catch(() => ({ cards: [], total: 0 })),
    ]);

    // ELO
    const elo = state.elo ?? 1200;
    const provisional = state.gamesPlayed < 15;
    document.getElementById('elo-value').textContent =
      elo + (provisional ? '' : '');
    document.getElementById('elo-display').textContent =
      `${elo} vs engines${provisional ? ' (provisional)' : ''}`;
    document.getElementById('elo-delta').textContent =
      state.eloDelta ? `${state.eloDelta > 0 ? '+' : ''}${state.eloDelta} vs last game` : '';

    // Due
    const dueCount = due.total ?? due.cards?.length ?? 0;
    const DUE_SOFT_CAP = 40;
    const dueLabel = dueCount > DUE_SOFT_CAP ? `${DUE_SOFT_CAP}+` : String(dueCount);
    document.getElementById('due-value').textContent = dueLabel;
    document.getElementById('drill-count').textContent = dueLabel;
    document.querySelectorAll('#due-count').forEach((el) => { el.textContent = dueLabel; });

    // Streak tile visibility (show_streak setting)
    const showStreak = state.showStreak !== false;
    const streakTile = document.getElementById('tile-streak');
    if (!showStreak && streakTile) streakTile.style.display = 'none';
    if (showStreak) {
      document.getElementById('streak-value').textContent = String(state.streak ?? 0);
    }

    // Suggested opponent
    document.getElementById('suggested-opponent').textContent =
      state.suggestedOpponent
        ? `Suggested: ${state.suggestedOpponent}`
        : 'Choose your opponent';

    // Sparklines
    if (state.eloHistory?.length) {
      const canvas = document.getElementById('spark-elo');
      if (canvas) drawSparkline(canvas, state.eloHistory.map((h) => h.elo));
    }

    // ELO chart
    if (state.eloHistory?.length) {
      const canvas = document.getElementById('elo-chart');
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = 100 * window.devicePixelRatio;
      canvas.style.width = '100%';
      canvas.style.height = '100px';
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      const data = state.eloHistory.slice(-90);
      const vals = data.map((h) => h.elo);
      const minV = Math.min(...vals) - 20;
      const maxV = Math.max(...vals) + 20;
      const px = (i) => (i / (vals.length - 1 || 1)) * (W - 8) + 4;
      const py = (v) => H - 8 - ((v - minV) / (maxV - minV)) * (H - 16);
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3987e5';
      ctx.lineWidth = 2 * window.devicePixelRatio;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = px(i), y = py(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Time range filter (cosmetic — full chart is on stats.html)
    document.getElementById('time-filter')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-range]');
      if (!btn) return;
      document.querySelectorAll('#time-filter [data-range]').forEach((b) => b.classList.remove('btn--primary'));
      btn.classList.add('btn--primary');
    });

    // Recent games
    const games = state.recentGames ?? [];
    const tbody = document.getElementById('recent-games-body');
    if (!games.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:var(--ink-muted);font-size:13px">Play your first game.</td></tr>';
    } else {
      tbody.innerHTML = games.slice(0, 8).map((g) => {
        const icon = g.result === 'win' ? '✓' : g.result === 'loss' ? '✗' : '=';
        const cls = g.result === 'win' ? 'result-icon--won' : g.result === 'loss' ? 'result-icon--lost' : '';
        return `<tr>
          <td><span class="${cls}">${icon}</span></td>
          <td><a href="review.html?game=${g.id}" style="color:var(--ink-secondary)">${g.opponentId}</a></td>
          <td>${g.accuracy != null ? Math.round(g.accuracy) + '%' : '—'}</td>
          <td>${g.puzzleCount ?? 0} puzzles</td>
          <td style="color:var(--ink-muted);font-size:12px">${relativeTime(g.playedAt)}</td>
        </tr>`;
      }).join('');
    }
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

init();
