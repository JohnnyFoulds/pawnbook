/**
 * @module public/js/repertoire
 * Fetches and renders the repertoire page: coverage, changelog with reverse button, challenges.
 * Connects to the game WebSocket to refresh on repertoire_update events.
 */

async function init() {
  await Promise.all([loadCoverage(), loadTree(), loadGaps(), loadRefusals(), loadChangelog(), loadChallenges()]);
  connectForUpdates();
  document.getElementById('show-candidates').addEventListener('change', renderTree);
  document.getElementById('show-alt').addEventListener('change', renderTree);
}

let _treeNodes = [];

async function loadTree() {
  try {
    const r = await fetch('/api/repertoire/tree');
    const data = await r.json();
    _treeNodes = (data.nodes ?? []).sort((a, b) => (a.minPly ?? 0) - (b.minPly ?? 0) || a.epd.localeCompare(b.epd));
    renderTree();
  } catch (err) {
    console.error('Tree load failed', err);
    document.getElementById('tree-list').innerHTML = '<div style="color:var(--ink-muted);font-size:13px">Could not load tree.</div>';
  }
}

function renderTree() {
  const showCandidates = document.getElementById('show-candidates')?.checked ?? false;
  const showAlt = document.getElementById('show-alt')?.checked ?? true;
  const el = document.getElementById('tree-list');
  if (!_treeNodes.length) {
    el.innerHTML = '<div style="color:var(--ink-muted);font-size:13px">No book moves yet.</div>';
    return;
  }
  const ROLE_ORDER = { canonical: 0, alt: 1, candidate: 2, retired: 3, refused: 4, quarantined: 5 };
  const ROLE_STYLE = {
    canonical: 'color:var(--ink);font-weight:600',
    alt: 'color:var(--ink-muted)',
    candidate: 'color:var(--ink-muted);font-style:italic',
    retired: 'color:var(--ink-muted);text-decoration:line-through',
  };
  const rows = [];
  for (const node of _treeNodes) {
    const ply = node.minPly ?? 0;
    const indent = '  '.repeat(Math.floor(ply / 2));
    const moveNo = Math.ceil(ply / 2);
    const moves = (node.moves ?? [])
      .filter(m => {
        if (m.role === 'canonical') return true;
        if (m.role === 'alt') return showAlt;
        if (m.role === 'candidate') return showCandidates;
        return false;
      })
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
    if (!moves.length && !showCandidates) continue;
    const moveParts = moves.map(m => {
      const style = ROLE_STYLE[m.role] ?? 'color:var(--ink-muted)';
      const label = m.moveSan ?? m.moveUci;
      return `<span style="${style}" title="${m.role}">${label}</span>`;
    }).join(' <span style="color:var(--ink-muted)">·</span> ');
    const reachStr = node.reachProb != null ? ` <span style="color:var(--ink-muted)">(${(node.reachProb * 100).toFixed(1)}%)</span>` : '';
    rows.push(`<div style="white-space:pre">${indent}<span style="color:var(--ink-muted);font-size:11px">${moveNo ? moveNo + (ply % 2 === 1 ? '.' : '…') + ' ' : ''}</span>${moveParts}${reachStr}</div>`);
  }
  el.innerHTML = rows.length ? rows.join('') : '<div style="color:var(--ink-muted);font-size:13px">No moves to display.</div>';
}

async function loadGaps() {
  try {
    const r = await fetch('/api/repertoire/gaps');
    const data = await r.json();
    const gaps = data.gaps ?? [];
    const el = document.getElementById('gaps-list');
    if (!gaps.length) {
      el.innerHTML = '<div style="color:var(--ink-muted);font-size:13px">No significant gaps — good coverage.</div>';
      return;
    }
    el.innerHTML = gaps.slice(0, 10).map(g => {
      const pct = (g.reachProb * 100).toFixed(1);
      return `<div style="font-size:12px"><span style="color:var(--ink-muted);margin-right:8px">${pct}%</span><span>${g.opponentReplyUci}</span></div>`;
    }).join('');
  } catch (err) {
    console.error('Gaps load failed', err);
    document.getElementById('gaps-list').innerHTML = '<div style="color:var(--ink-muted);font-size:13px">Could not load gaps.</div>';
  }
}

async function loadRefusals() {
  try {
    const r = await fetch('/api/repertoire/refusals?limit=50');
    const data = await r.json();
    const { refusals, keptCount, keptInBookCount, hitRatePct } = data;
    const summaryEl = document.getElementById('refusal-summary');
    const listEl = document.getElementById('refusal-list');
    if (!refusals.length) {
      summaryEl.textContent = 'No alerted deviations yet.';
      listEl.innerHTML = '';
      return;
    }
    summaryEl.textContent = hitRatePct != null
      ? `${keptCount} kept — ${keptInBookCount} became book moves (${hitRatePct}% hit rate)`
      : `${refusals.length} alerted deviations`;
    const KIND_LABELS = { order_slip: 'Order', lapse: 'Lapse', novelty: 'New', refused_repeat: 'Refused' };
    listEl.innerHTML = refusals.map(d => {
      const kindLabel = KIND_LABELS[d.kind] ?? d.kind;
      const res = d.resolution === 'alerted_kept' ? 'kept' : d.resolution === 'alerted_corrected' ? 'corrected' : 'timeout';
      return `<li style="font-size:12px;display:flex;gap:8px;align-items:baseline">
        <span style="color:var(--ink-muted);flex-shrink:0;width:56px">${kindLabel}</span>
        <span style="color:var(--ink-muted);flex-shrink:0;width:40px">${res}</span>
        <span style="font-family:monospace">${d.playedUci ?? ''}</span>
      </li>`;
    }).join('');
  } catch (err) {
    console.error('Refusals load failed', err);
    document.getElementById('refusal-summary').textContent = 'Could not load refusal log.';
  }
}

async function loadCoverage() {
  try {
    const r = await fetch('/api/repertoire/coverage');
    const data = await r.json();
    document.getElementById('coverage-pct').textContent = `${data.coveragePct}%`;
    document.getElementById('canonical-count').textContent = data.canonicalCount;
    document.getElementById('candidate-count').textContent = data.candidateCount;
    document.getElementById('total-nodes').textContent = data.totalNodes;
  } catch (err) {
    console.error('Coverage load failed', err);
    document.getElementById('coverage-pct').textContent = '—';
  }
}

async function loadChangelog() {
  try {
    const r = await fetch('/api/repertoire/changelog?limit=20');
    const { entries } = await r.json();
    const list = document.getElementById('changelog-list');
    if (!entries.length) {
      list.innerHTML = '<li style="color:var(--ink-muted);font-size:13px">No book changes yet.</li>';
      return;
    }
    list.innerHTML = entries.map(e => {
      const date = new Date(e.at).toLocaleDateString();
      const ruleText = e.rule ? ` (rule ${e.rule})` : '';
      const from = e.fromSan ?? e.fromUci ?? '';
      const to = e.toSan ?? e.toUci ?? '';
      let desc;
      if (e.kind === 'promote') {
        desc = `${to} replaced ${from}${ruleText}`;
      } else if (e.kind === 'settle') {
        desc = `${from} and ${to} both kept as book moves`;
      } else if (e.kind === 'reverse') {
        desc = `Book change reversed`;
      } else if (e.kind === 'confirm') {
        desc = `${to || from} confirmed into book`;
      } else if (e.kind === 'elect') {
        desc = `${to || from} elected canonical${ruleText}`;
      } else if (e.kind === 'retire') {
        desc = `${from || to} retired (candidate TTL)`;
      } else if (e.kind === 'quarantine_exit') {
        desc = `${from || to} exited quarantine`;
      } else if (e.kind === 'refuse') {
        desc = `${from || to} refused`;
      } else {
        desc = e.kind;
      }

      const reversible = e.kind === 'promote' || e.kind === 'settle';
      const reverseBtn = reversible
        ? `<button data-id="${e.id}" class="changelog-reverse-btn"
             style="margin-left:10px;padding:2px 8px;font-size:11px;cursor:pointer;
                    border:1px solid var(--ink-muted);border-radius:3px;background:none;
                    color:var(--ink-muted)">Reverse</button>`
        : '';

      return `<li style="font-size:13px;display:flex;align-items:center">
        <span style="color:var(--ink-muted);font-size:11px;margin-right:8px;flex-shrink:0">${date}</span>
        <span>${desc}</span>${reverseBtn}
      </li>`;
    }).join('');

    list.querySelectorAll('.changelog-reverse-btn').forEach(btn => {
      btn.addEventListener('click', () => reverseEntry(btn.dataset.id, btn));
    });
  } catch (err) {
    console.error('Changelog load failed', err);
    document.getElementById('changelog-list').innerHTML =
      '<li style="color:var(--ink-muted);font-size:13px">Could not load changelog.</li>';
  }
}

async function reverseEntry(id, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const r = await fetch(`/api/repertoire/changelog/${id}/reverse`, { method: 'POST' });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      console.error('Reverse failed', body);
      btn.textContent = 'Error';
      btn.disabled = false;
      return;
    }
    await Promise.all([loadChangelog(), loadCoverage()]);
  } catch (err) {
    console.error('Reverse error', err);
    btn.textContent = 'Error';
    btn.disabled = false;
  }
}

async function loadChallenges() {
  try {
    const r = await fetch('/api/repertoire/challenges');
    const { challenges } = await r.json();
    document.getElementById('open-challenges').textContent = challenges.length;
  } catch {
    document.getElementById('open-challenges').textContent = '—';
  }
}

function connectForUpdates() {
  const wsUrl = `ws://${location.host}/ws`;
  let ws;
  let reconnectTimer = null;

  function connect() {
    ws = new WebSocket(wsUrl);
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'repertoire_update') {
        Promise.all([loadChangelog(), loadCoverage(), loadChallenges(), loadTree(), loadGaps(), loadRefusals()]);
      }
    });
    ws.addEventListener('close', () => {
      reconnectTimer = setTimeout(connect, 5000);
    });
  }

  connect();
  window.addEventListener('beforeunload', () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.close();
  });
}

document.addEventListener('DOMContentLoaded', init);
