/**
 * @module public/js/games
 * Games list page: tabular game history linking to review.
 */

const BASE = '';

async function api(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

async function boot() {
  try {
    const [data, state] = await Promise.all([
      api('/api/games'),
      api('/api/state').catch(() => ({})),
    ]);

    const dueCount = state.dueCount ?? 0;
    document.querySelectorAll('#due-count').forEach((el) => { el.textContent = String(dueCount); });

    const games = data.games ?? [];
    const tbody = document.getElementById('games-body');

    if (!games.length) {
      document.getElementById('games-table').style.display = 'none';
      document.getElementById('empty-games').style.display = '';
      return;
    }

    tbody.innerHTML = games.map((g) => {
      const icon = g.result === 'win' ? '✓' : g.result === 'loss' ? '✗' : '=';
      const cls = g.result === 'win' ? 'result-icon--won' : g.result === 'loss' ? 'result-icon--lost' : '';
      const delta = g.eloAfter != null && g.eloBefore != null
        ? g.eloAfter - g.eloBefore
        : null;
      return `<tr>
        <td><span class="${cls}">${icon}</span></td>
        <td><a href="review.html?game=${g.id}" style="color:var(--ink-secondary)">${g.opponentId}</a></td>
        <td style="color:var(--ink-muted);font-size:13px">${g.playerColor ?? ''}</td>
        <td class="num" style="text-align:right">${g.accuracy != null ? Math.round(g.accuracy) + '%' : '—'}</td>
        <td class="num" style="text-align:right;color:${delta == null ? 'inherit' : delta >= 0 ? 'var(--good)' : 'var(--critical)'}">
          ${delta != null ? (delta >= 0 ? '+' : '') + delta : '—'}
        </td>
        <td class="num" style="text-align:right">${g.puzzleCount ?? 0}</td>
        <td style="color:var(--ink-muted);font-size:12px">${relativeTime(g.playedAt)}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('Games error:', err);
  }
}

boot();
