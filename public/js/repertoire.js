/**
 * @module public/js/repertoire
 * Fetches and renders the repertoire page: coverage, changelog with reverse button, challenges.
 * Connects to the game WebSocket to refresh on repertoire_update events.
 */

async function init() {
  await Promise.all([loadCoverage(), loadChangelog(), loadChallenges()]);
  connectForUpdates();
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
        Promise.all([loadChangelog(), loadCoverage(), loadChallenges()]);
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
