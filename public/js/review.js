/**
 * @module public/js/review
 * Review page: eval graph, breakdown bar, accuracy bars, mistake list.
 * The board is read-only (scrub board driven by graph hover).
 * No eval is computed here — all data comes from the server.
 */

import { drawEvalGraph, renderEvalTable, renderBreakdownBar } from './lib/chart.js';
import { QUALITY, GLYPH_TIERS } from '/shared/quality.js';

const BASE = '';

const MOTIF_LABEL = {
  hanging_piece: 'hanging piece', fork: 'fork', back_rank: 'back rank',
  missed_capture: 'missed capture', overloaded_defender: 'overloaded defender',
  pinned_piece: 'pin', skewer: 'skewer', discovered_attack: 'discovered attack',
};

async function api(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function getGameId() {
  return new URLSearchParams(location.search).get('game');
}

async function boot() {
  const gameId = getGameId();
  if (!gameId) {
    const meta = document.getElementById('game-meta');
    meta.innerHTML = 'No game specified — <a href="games.html" style="color:var(--accent)">choose a game</a>.';
    document.querySelector('.review-grid').style.display = 'none';
    document.getElementById('acc-bars').style.display = 'none';
    return;
  }

  try {
    const [review, state] = await Promise.all([
      api(`/api/games/${gameId}/review`),
      api('/api/state').catch(() => ({})),
    ]);

    const dueCount = state.dueCount ?? 0;
    document.querySelectorAll('#due-count').forEach((el) => { el.textContent = String(dueCount); });

    renderHeader(review);

    if (review.analysisState !== 'done') {
      const isFailed = review.analysisState === 'failed';
      const msg = isFailed
        ? `Analysis failed${review.analysisError ? ': ' + review.analysisError : ''}. You can retry from the Games page.`
        : 'Analysis is still running — this page will refresh automatically.';
      document.getElementById('acc-bars').innerHTML =
        `<div style="color:var(--ink-muted);padding:16px 0">${msg}</div>`;
      if (!isFailed) setTimeout(() => location.reload(), 3000);
      return;
    }

    renderAccuracyBars(review);
    renderStrengthLine(review);
    renderMoveList(review.moves ?? []);
    renderEvalGraphSection(review);
    renderBreakdownSection(review);
    renderDebriefCard(review);
    renderMistakeList(review);
    setupQuizLink(gameId, review.puzzleCount ?? 0);
    await setupBoard(review);
  } catch (err) {
    console.error('Review error:', err);
    document.getElementById('game-meta').textContent = 'Failed to load review.';
  }
}

function renderHeader(review) {
  const termMap = {
    checkmate: 'by checkmate', resignation: 'by resignation',
    stalemate: 'by stalemate', threefold: 'by threefold repetition',
    fifty_move: 'by fifty-move rule', insufficient_material: 'by insufficient material',
    timeout: 'on time', abandoned: 'game abandoned',
  };
  const result = review.result === 'win' ? 'Won' : review.result === 'loss' ? 'Lost' : 'Drew';
  document.getElementById('game-meta').textContent =
    `vs ${review.opponentId} · you were ${review.playerColor} · ${result} ${termMap[review.termination] ?? ''}`;
}

function renderAccuracyBars(review) {
  const container = document.getElementById('acc-bars');
  const rows = [
    { label: 'You', pct: review.accuracy ?? 0 },
    { label: review.opponentId ?? 'Opponent', pct: review.opponentAccuracy ?? 0 },
  ];
  container.innerHTML = rows.map((r) => `
    <div class="acc-bar-row">
      <div class="acc-bar-label">${r.label}</div>
      <div class="acc-bar-track">
        <div class="acc-bar-fill" style="width:${r.pct}%"></div>
      </div>
      <div class="acc-bar-pct">${Math.round(r.pct)}%</div>
    </div>
  `).join('');
}

function renderStrengthLine(review) {
  const el = document.getElementById('strength-line');
  if (!el) return;
  const { strengthElo, opponentStrengthElo, strengthSe, opponentStrengthSe, rollingStrength, rollingSe, opponentId, maia3LogProb } = review;
  if (strengthElo == null && opponentStrengthElo == null) {
    el.innerHTML = '<span style="color:var(--ink-muted)">Not enough positions to estimate strength.</span>';
    return;
  }
  const fmt = (elo, se) => elo != null ? `${elo}${se != null ? ' <span style="color:var(--ink-muted)">±' + se + '</span>' : ''}` : '—';
  const rolling = rollingStrength != null
    ? `<span style="color:var(--ink-muted);font-size:12px;margin-left:12px">Last 10 games: ${rollingStrength}${rollingSe != null ? ' ±' + rollingSe : ''}</span>`
    : '';
  const styleScore = maia3LogProb != null
    ? ` &nbsp;·&nbsp; <span title="Style match: how often Maia-3 predicted your moves at your Elo level">Style ${Math.round(100 * Math.exp(maia3LogProb))}%</span>`
    : '';
  el.innerHTML =
    `<strong>You</strong> ${fmt(strengthElo, strengthSe)} &nbsp;·&nbsp; ` +
    `<strong>${opponentId ?? 'Opponent'}</strong> ${fmt(opponentStrengthElo, opponentStrengthSe)}` +
    rolling +
    styleScore +
    `<span style="color:var(--ink-muted);font-size:11px;margin-left:8px">(± = 1 SE)</span>`;
}

function renderMoveList(moves) {
  const list = document.getElementById('move-list');
  list.innerHTML = '';
  for (let i = 0; i < moves.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const white = moves[i];
    const black = moves[i + 1];
    const row = document.createElement('div');
    row.className = 'move-list__row';

    const glyphFor = (m) => {
      if (!m || !m.classification || !GLYPH_TIERS.includes(m.classification)) {
        return '<span class="move-list__glyph"></span>';
      }
      const tier = QUALITY[m.classification];
      return `<span class="move-list__glyph quality-chip--${m.classification}">${tier.glyph}</span>`;
    };

    row.innerHTML = `
      <span class="move-list__num">${moveNum}.</span>
      <span class="move-list__move" data-ply="${white?.ply}"><span class="move-list__san">${white?.san ?? ''}</span>${glyphFor(white)}</span>
      <span class="move-list__move" data-ply="${black?.ply}"><span class="move-list__san">${black?.san ?? ''}</span>${glyphFor(black)}</span>
    `;
    list.appendChild(row);
  }

  list.addEventListener('click', (e) => {
    const el = e.target.closest('[data-ply]');
    if (!el || !el.dataset.ply) return;
    const ply = parseInt(el.dataset.ply);
    scrubToPly(ply);
    document.querySelectorAll('.move-list__move').forEach((m) =>
      m.classList.toggle('move-list__move--active', parseInt(m.dataset.ply) === ply));
  });
}

function renderEvalGraphSection(review) {
  const canvas = document.getElementById('eval-canvas');
  const wrap = canvas.parentElement;
  canvas.width = wrap.offsetWidth * window.devicePixelRatio || 600;
  canvas.height = 120 * window.devicePixelRatio;
  canvas.style.width = '100%';
  canvas.style.height = '120px';

  const evals = (review.moves ?? []).map((m) => ({
    ply: m.ply,
    winPct: m.winPct ?? 50,
  }));

  const mistakes = (review.moves ?? []).filter((m) =>
    m.mover === 'player' && m.classification && m.classification !== 'ok' && m.classification !== 'good' && m.classification !== 'best'
  );

  drawEvalGraph(canvas, evals, mistakes, {
    onHover: (plyIdx, evalData) => {
      if (plyIdx >= 0 && evalData) scrubToPly(evalData.ply);
    },
  });

  // Table view toggle
  document.getElementById('eval-table-toggle').addEventListener('click', () => {
    const wrap = document.getElementById('eval-table-wrap');
    const visible = wrap.style.display !== 'none';
    wrap.style.display = visible ? 'none' : '';
    renderEvalTable(document.getElementById('eval-table-body'),
      (review.moves ?? []).map((m) => ({
        ply: m.ply, san: m.san, winPct: m.winPct, classification: m.classification,
      })));
  });
}

function renderBreakdownSection(review) {
  const moves = (review.moves ?? []).filter((m) => m.mover === 'player');
  document.getElementById('move-count').textContent = `· ${moves.length} graded`;

  const counts = {};
  moves.forEach((m) => { counts[m.classification] = (counts[m.classification] || 0) + 1; });

  renderBreakdownBar(document.getElementById('breakdown-bar'), counts);

  document.getElementById('breakdown-table-toggle').addEventListener('click', () => {
    const wrap = document.getElementById('breakdown-table-wrap');
    const visible = wrap.style.display !== 'none';
    wrap.style.display = visible ? 'none' : '';
    const total = moves.length || 1;
    const tbody = document.getElementById('breakdown-table-body');
    tbody.innerHTML = Object.entries(QUALITY).map(([key, tier]) => {
      const n = counts[key] || 0;
      return `<tr>
        <td>${tier.label}</td>
        <td class="num">${n}</td>
        <td class="num">${Math.round((n / total) * 100)}%</td>
      </tr>`;
    }).join('');
  });
}

function renderDebriefCard(review) {
  const summary = review.motifSummary ?? [];
  const card = document.getElementById('debrief-card');
  if (!summary.length) { card.hidden = true; return; }
  card.hidden = false;
  document.getElementById('debrief-body').innerHTML = summary.map((s) => {
    const label = MOTIF_LABEL[s.tag] ?? s.tag.replace(/_/g, ' ');
    const times = s.count === 1 ? '1 time' : `${s.count} times`;
    return `<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">
      <span class="mistake-row__tag mistake-row__tag--motif">${label}</span>
      <span style="font-size:13px;color:var(--ink-muted)">${times}</span>
      <a href="puzzles.html?motif=${encodeURIComponent(s.tag)}" style="margin-left:auto;font-size:12px">Drill →</a>
    </div>`;
  }).join('');
}

function renderMistakeList(review) {
  const drillable = (review.mistakes ?? []).filter((m) => !m.engineOnly);
  const engineOnly = (review.mistakes ?? []).filter((m) => m.engineOnly);

  document.getElementById('drill-count').textContent = `· ${drillable.length}`;
  document.getElementById('engine-only-count').textContent = `(${engineOnly.length})`;

  const renderMistake = (m) => {
    const tier = QUALITY[m.classification];
    const glyph = tier?.glyph ?? '';
    const chip = glyph
      ? `<span class="quality-chip quality-chip--${m.classification}">${glyph}</span>`
      : '';
    const motifBadge = m.motifTag ? `<span class="mistake-row__tag mistake-row__tag--motif">${MOTIF_LABEL[m.motifTag] ?? m.motifTag.replace(/_/g, ' ')}</span>` : '';
    const explainHtml = m.motifExplanation
      ? `<div class="mistake-row__explain">${m.motifExplanation}</div>`
      : '';
    return `<div class="mistake-row">
      <div class="mistake-row__head">
        ${chip}
        <span class="mistake-row__move">${m.moveSan}</span>
        <span class="mistake-row__loss">lost ${m.winLoss != null ? Math.round(m.winLoss) : '?'}% win</span>
        ${m.tags?.includes('common_trap') ? '<span class="mistake-row__tag">common trap</span>' : ''}
        ${motifBadge}
      </div>
      <div class="mistake-row__detail">
        Best was ${m.bestMoveSan}${m.findability != null
          ? ` — ${m.maiaNearestModel ?? 'Maia'} finds it ${Math.round(m.findability * 100)}% of the time`
          : ''}
      </div>
      ${explainHtml}
    </div>`;
  };

  document.getElementById('mistake-list').innerHTML =
    drillable.length ? drillable.map(renderMistake).join('') : '<div style="color:var(--ink-muted);font-size:13px">No drillable mistakes found.</div>';

  document.getElementById('engine-only-list').innerHTML =
    engineOnly.map(renderMistake).join('');
}

function setupQuizLink(gameId, puzzleCount) {
  const link = document.getElementById('quiz-link');
  link.href = `quiz.html?game=${gameId}`;
  if (puzzleCount > 0) {
    link.textContent = `Start quiz (${puzzleCount} position${puzzleCount === 1 ? '' : 's'})`;
  } else {
    link.textContent = 'No puzzles found';
    link.classList.add('btn--ghost');
    link.classList.remove('btn--primary');
    link.style.pointerEvents = 'none';
  }
}

// ── Scrub board (read-only) ────────────────────────────────────────────────

let reviewMoves = [];
let reviewBoard = null;

async function setupBoard(review) {
  reviewMoves = review.moves ?? [];
  const el = document.getElementById('board-wrap');
  el.innerHTML = '';
  document.getElementById('ply-label').textContent = '';

  if (!reviewMoves.length) return;

  const [{ Chessboard }, { createBoard }] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/Chessboard.js'),
    import('./lib/board.js'),
  ]);

  // reviewMoves[0].fen is the position before move 1 (= start position)
  const startFen = reviewMoves[0]?.fen ?? 'start';
  reviewBoard = await createBoard(el, Chessboard, {
    readOnly: true,
    position: startFen,
    orientation: review.playerColor ?? 'white',
  });
}

function scrubToPly(ply) {
  const move = reviewMoves.find((m) => m.ply === ply);
  if (!move) return;

  const plyNum = Math.ceil(ply / 2);
  const isBlack = ply % 2 === 0;
  document.getElementById('ply-label').textContent =
    `${plyNum}${isBlack ? '…' : '.'}  ${move.san ?? ''}`;

  if (reviewBoard && move.fen) {
    const from = move.uci?.slice(0, 2);
    const to = move.uci?.slice(2, 4);
    reviewBoard.setPosition(move.fen, from, to);
  }

  // Highlight active move in the move list
  document.querySelectorAll('.move-list__move').forEach((el) =>
    el.classList.toggle('move-list__move--active', parseInt(el.dataset.ply) === ply));
}

boot();
