/**
 * @module public/js/quiz
 * Post-game quiz: one retry then teach, practice=1 (no scheduling).
 * Feedback leads with glyph/word — never colour alone.
 * Correctness and rating are derived server-side; the client sends only
 * {move, msTaken, hintUsed, attemptNo, phase:'quiz'}.
 */


const BASE = '';

async function api(path, opts) {
  const r = await fetch(BASE + path, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function getGameId() {
  return new URLSearchParams(location.search).get('game');
}

let positions = [];
let currentIdx = 0;
let currentPuzzleId = null;
let attemptNo = 1;
let hintUsed = false;
let startMs = 0;
let currentLegalMoves = [];  // UCI strings for the current puzzle position

async function boot() {
  const gameId = getGameId();
  if (!gameId) return;

  try {
    const quiz = await api(`/api/games/${gameId}/quiz`);
    positions = quiz.positions ?? [];

    document.getElementById('pos-total').textContent = String(positions.length);
    document.getElementById('game-opp').textContent = quiz.opponentId ?? '';

    if (positions.length === 0) {
      document.getElementById('drill-prompt').textContent = 'No quiz positions for this game.';
      return;
    }

    loadPosition(0);
  } catch (err) {
    console.error('Quiz error:', err);
    document.getElementById('drill-prompt').textContent = 'Failed to load quiz.';
  }
}

function loadPosition(idx) {
  if (idx >= positions.length) {
    showDone();
    return;
  }
  currentIdx = idx;
  const pos = positions[idx];
  currentPuzzleId = pos.puzzleId;
  attemptNo = 1;
  hintUsed = false;
  startMs = Date.now();

  document.getElementById('pos-num').textContent = String(idx + 1);
  document.getElementById('move-label').textContent =
    `Move ${Math.ceil(pos.ply / 2)}${pos.ply % 2 === 1 ? '.' : '…'}  ${pos.sideToMove === 'white' ? 'White' : 'Black'} to play`;

  document.getElementById('drill-prompt').innerHTML =
    `You played <span class="drill-prompt__move">${pos.playedMoveSan}</span> here and `
    + `lost ${pos.winLoss != null ? Math.round(pos.winLoss) : '?'}% win chance.<br>`
    + 'Find something better.';

  document.getElementById('feedback-wrap').innerHTML = '';
  document.getElementById('hint-btn').style.display = '';
  document.getElementById('skip-btn').style.display = '';
  document.getElementById('next-wrap').style.display = 'none';

  initBoard(pos.fen, pos.sideToMove);
}

async function initBoard(fen, sideToMove) {
  const el = document.getElementById('board-wrap');
  if (!el) return;
  el.innerHTML = '';
  const [{ Chessboard }, { createBoard }, { Chess }] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/Chessboard.js'),
    import('./lib/board.js'),
    import('https://cdn.jsdelivr.net/npm/chess.js@1/+esm'),
  ]);
  const chess = new Chess(fen);
  currentLegalMoves = chess.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? ''));
  await createBoard(el, Chessboard, {
    position: fen,
    orientation: sideToMove === 'black' ? 'black' : 'white',
    onMove: ({ from, to }) => submitMove(from + to),
    getLegalMoves: () => currentLegalMoves,
  });
}

async function submitMove(uci) {
  const msTaken = Date.now() - startMs;
  try {
    const result = await api(`/api/puzzles/${currentPuzzleId}/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        move: uci,
        msTaken,
        hintUsed,
        attemptNo,
        phase: 'quiz',
      }),
    });
    showFeedback(result);
  } catch (err) {
    console.error('Attempt error:', err);
  }
}

function showFeedback(result) {
  const wrap = document.getElementById('feedback-wrap');
  const correct = result.correct;

  if (correct) {
    wrap.innerHTML = `<div class="drill-feedback drill-feedback--correct">
      <span class="drill-feedback__glyph">✓</span>
      <div>Correct.${result.followupRequired ? ' Now find the continuation.' : ''}</div>
    </div>`;
    document.getElementById('hint-btn').style.display = 'none';
    document.getElementById('skip-btn').style.display = 'none';
    showNextAfterDelay();
  } else if (attemptNo === 1) {
    attemptNo = 2;
    wrap.innerHTML = `<div class="drill-feedback drill-feedback--wrong">
      <span class="drill-feedback__glyph">✗</span>
      <div>Not the best. One more try.</div>
    </div>`;
  } else {
    // Teach
    wrap.innerHTML = `<div class="drill-feedback drill-feedback--wrong">
      <span class="drill-feedback__glyph">✗</span>
      <div>Best was <strong>${result.bestMoveSan}</strong>.
        ${result.winLoss != null ? `Lost ${Math.round(result.winLoss)}% win chance.` : ''}
      </div>
    </div>`;
    document.getElementById('hint-btn').style.display = 'none';
    document.getElementById('skip-btn').style.display = 'none';
    document.getElementById('next-wrap').style.display = '';
  }
}

function showNextAfterDelay() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    document.getElementById('next-wrap').style.display = '';
  } else {
    setTimeout(() => {
      document.getElementById('next-wrap').style.display = '';
    }, 1200);
  }
}

function showDone() {
  document.getElementById('drill-prompt').textContent = 'Quiz complete.';
  document.getElementById('hint-btn').style.display = 'none';
  document.getElementById('skip-btn').style.display = 'none';
}

document.getElementById('hint-btn').addEventListener('click', async () => {
  hintUsed = true;
  try {
    const pos = positions[currentIdx];
    const piece = pos?.piece ?? '?';
    document.getElementById('hint-btn').textContent =
      `Move your ${piece}`;
    document.getElementById('hint-btn').disabled = true;
  } catch { /* hint is best-effort; ignore fetch errors */ }
});

document.getElementById('skip-btn').addEventListener('click', () => {
  loadPosition(currentIdx + 1);
});

document.getElementById('next-btn')?.addEventListener('click', () => {
  loadPosition(currentIdx + 1);
});

boot();
