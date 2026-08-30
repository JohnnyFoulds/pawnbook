/**
 * @module public/js/repertoire
 * Fetches and renders the repertoire page.
 */

async function init() {
  await Promise.all([loadCoverage(), loadChangelog(), loadChallenges()]);
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
      let desc;
      if (e.kind === 'promote') {
        desc = `${e.toUci} replaced ${e.fromUci}${ruleText}`;
      } else if (e.kind === 'settle') {
        desc = `${e.fromUci ?? ''} and ${e.toUci ?? ''} both kept as book moves`;
      } else if (e.kind === 'reverse') {
        desc = `Book change reversed`;
      } else if (e.kind === 'confirm') {
        desc = `${e.toUci ?? e.fromUci} confirmed into book`;
      } else {
        desc = e.kind;
      }
      return `<li style="font-size:13px">
        <span style="color:var(--ink-muted);font-size:11px;margin-right:8px">${date}</span>
        ${desc}
      </li>`;
    }).join('');
  } catch (err) {
    console.error('Changelog load failed', err);
    document.getElementById('changelog-list').innerHTML =
      '<li style="color:var(--ink-muted);font-size:13px">Could not load changelog.</li>';
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

document.addEventListener('DOMContentLoaded', init);
