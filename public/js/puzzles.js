/**
 * @module public/js/puzzles
 * Drill page: batches of 10, empty-state win, batch summary.
 * Uses the same attempt endpoint as quiz.js but with phase:'drill'.
 * Feedback leads with glyph/word — never colour alone.
 * Scheduling is handled server-side; client never calls the scheduler.
 */

import { QUALITY } from '/shared/quality.js';

const BASE = '';
const BATCH_SIZE = 10;
const DUE_SOFT_CAP = 40;

async function api(path, opts) {
  const r = await fetch(BASE + path, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

let batch = [];
let batchIdx = 0;
let solved = 0;
let missed = 0;
let attemptNo = 1;
let hintUsed = false;
let startMs = 0;

async function boot() {
  try {
    const due = await api('/api/puzzles/due');
    const cards = due.cards ?? [];
    const total = due.total ?? cards.length;

    // Update badge
    const dueLabel = total > DUE_SOFT_CAP ? `${DUE_SOFT_CAP}+` : String(total);
    document.querySelectorAll('#due-count').forEach((el) => { el.textContent = dueLabel; });

    if (!cards.length) {
      document.getElementById('empty-state').style.display = '';
      return;
    }

    batch = cards.slice(0, BATCH_SIZE);
    document.getElementById('drill-ui').style.display = '';
    document.getElementById('batch-total').textContent = String(batch.length);
    renderPips();
    loadCard(0);
  } catch (err) {
    console.error('Puzzles boot error:', err);
    document.getElementById('empty-state').style.display = '';
  }
}

function renderPips() {
  const pips = document.getElementById('drill-pips');
  pips.innerHTML = batch.map((_, i) => `<div class="drill-pip" id="pip-${i}"></div>`).join('');
  updateCurrentPip(0);
}

function updateCurrentPip(idx) {
  document.querySelectorAll('.drill-pip').forEach((p, i) => {
    if (i < idx) return; // keep solved/missed state
    if (i === idx) p.classList.add('drill-pip--current');
    else p.classList.remove('drill-pip--current');
  });
}

function loadCard(idx) {
  if (idx >= batch.length) {
    showSummary();
    return;
  }
  batchIdx = idx;
  const card = batch[idx];
  attemptNo = 1;
  hintUsed = false;
  startMs = Date.now();

  document.getElementById('batch-progress').textContent = String(idx + 1);
  updateCurrentPip(idx);

  const gameLink = document.getElementById('game-link');
  gameLink.href = `review.html?game=${card.sourceGameId}`;

  document.getElementById('move-label').textContent =
    `Move ${Math.ceil(card.ply / 2)}${card.ply % 2 === 1 ? '.' : '…'}  ${card.sideToMove === 'white' ? 'White' : 'Black'} to play`;

  document.getElementById('drill-prompt').innerHTML =
    `You played <span class="drill-prompt__move">${card.playedMoveSan}</span> here and `
    + `lost ${card.winLoss != null ? Math.round(card.winLoss) : '?'}% win chance.<br>`
    + 'Find something better.';

  document.getElementById('feedback-wrap').innerHTML = '';
  document.getElementById('action-btns').style.display = 'flex';
  document.getElementById('hint-btn').disabled = false;
  document.getElementById('hint-btn').textContent = 'Show hint';
  document.getElementById('next-wrap').style.display = 'none';
}

async function submitMove(uci) {
  const msTaken = Date.now() - startMs;
  const card = batch[batchIdx];
  try {
    const result = await api(`/api/puzzles/${card.puzzleId}/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        move: uci,
        msTaken,
        hintUsed,
        attemptNo,
        phase: 'drill',
      }),
    });
    showFeedback(result, card);
  } catch (err) {
    console.error('Attempt error:', err);
  }
}

function showFeedback(result, card) {
  const wrap = document.getElementById('feedback-wrap');
  const correct = result.correct;
  const pip = document.getElementById(`pip-${batchIdx}`);

  if (correct) {
    solved++;
    if (pip) { pip.classList.remove('drill-pip--current'); pip.classList.add('drill-pip--solved'); }
    wrap.innerHTML = `<div class="drill-feedback drill-feedback--correct">
      <span class="drill-feedback__glyph">✓</span>
      <div>Correct.${result.followupRequired ? ' Now find the continuation.' : ''}</div>
    </div>`;
    document.getElementById('action-btns').style.display = 'none';
    autoAdvance();
  } else if (attemptNo === 1) {
    attemptNo = 2;
    wrap.innerHTML = `<div class="drill-feedback drill-feedback--wrong">
      <span class="drill-feedback__glyph">✗</span>
      <div>Not the best. One more try.</div>
    </div>`;
  } else {
    missed++;
    if (pip) { pip.classList.remove('drill-pip--current'); pip.classList.add('drill-pip--missed'); }
    wrap.innerHTML = `<div class="drill-feedback drill-feedback--wrong">
      <span class="drill-feedback__glyph">✗</span>
      <div>Best was <strong>${result.bestMoveSan}</strong>.
        ${result.winLoss != null ? `Lost ${Math.round(result.winLoss)}% win.` : ''}
      </div>
    </div>`;
    document.getElementById('action-btns').style.display = 'none';
    document.getElementById('next-wrap').style.display = '';
  }
}

function autoAdvance() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    loadCard(batchIdx + 1);
  } else {
    setTimeout(() => loadCard(batchIdx + 1), 1200);
  }
}

function showSummary() {
  document.getElementById('drill-ui').style.display = 'none';
  document.getElementById('summary-state').style.display = '';
  document.getElementById('summary-text').textContent =
    `${solved} solved · ${missed} missed`;
}

document.getElementById('hint-btn').addEventListener('click', () => {
  hintUsed = true;
  const card = batch[batchIdx];
  document.getElementById('hint-btn').textContent = `Move your ${card?.piece ?? '?'}`;
  document.getElementById('hint-btn').disabled = true;
});

document.getElementById('skip-btn').addEventListener('click', () => {
  missed++;
  const pip = document.getElementById(`pip-${batchIdx}`);
  if (pip) { pip.classList.remove('drill-pip--current'); pip.classList.add('drill-pip--missed'); }
  loadCard(batchIdx + 1);
});

document.getElementById('next-btn').addEventListener('click', () => {
  loadCard(batchIdx + 1);
});

document.getElementById('next-batch-btn').addEventListener('click', async () => {
  solved = 0; missed = 0;
  document.getElementById('summary-state').style.display = 'none';
  await boot();
});

boot();
