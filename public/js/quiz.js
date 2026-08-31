/**
 * @module public/js/quiz
 * Post-game quiz: one retry then teach, practice=1 (no scheduling).
 * Feedback leads with glyph/word — never colour alone.
 * Correctness and rating are derived server-side; the client sends only
 * {move, msTaken, hintUsed, attemptNo, phase:'quiz'}.
 */


const BASE = '';

const PIECE_NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

const MOTIF_EXPLANATION = {
  back_rank: 'Your king was left on the back rank without an escape square — the opponent\'s rook or queen can deliver a back-rank mate.',
  missed_capture: 'There was a piece you could capture for free or at a material gain — scanning for loose opponent pieces before moving is worth the habit.',
  fork: 'After this move, the opponent\'s piece attacked two of your pieces at once. Look for knights and diagonals that can create double threats.',
  overloaded_defender: 'One of your pieces was carrying two defensive jobs at once. When a single piece guards two targets, the opponent can pick one off and the overloaded guardian can only save the other.',
  pinned_piece: 'After this move one of your pieces was pinned — it was stuck in place because moving it would expose a more valuable piece behind it to capture.',
  skewer: 'After this move an opponent slider targeted one of your valuable pieces, and a less valuable piece was sitting behind it. When the attacked piece moves to safety, the piece behind is captured for free.',
  discovered_attack: 'Moving this piece uncovered a hidden attack by an opponent — a slider that was blocked by your piece can now reach another one of your pieces.',
};

async function computeThreatExplanation(fen, playedMoveSan, sideToMove) {
  try {
    const { Chess } = await import('https://cdn.jsdelivr.net/npm/chess.js@1/+esm');
    const chess = new Chess(fen);
    const playerColor = sideToMove === 'white' ? 'w' : 'b';
    const oppColor = playerColor === 'w' ? 'b' : 'w';

    const played = chess.move(playedMoveSan);
    if (!played) return null;

    const hanging = [];
    for (const row of chess.board()) {
      for (const cell of row) {
        if (!cell || cell.color !== playerColor) continue;
        if (!chess.isAttacked(cell.square, oppColor)) continue;
        const attackers = chess.attackers(cell.square, oppColor)
          .map(s => chess.get(s)).filter(Boolean);
        const defenders = chess.attackers(cell.square, playerColor);
        const undefended = defenders.length === 0;
        const cheapest = attackers.reduce((m, p) => Math.min(m, PIECE_VALUE[p.type] ?? 99), 99);
        if (undefended || cheapest < PIECE_VALUE[cell.type]) {
          hanging.push({ sq: cell.square, type: cell.type });
        }
      }
    }
    if (!hanging.length) return null;

    const movedName = PIECE_NAME[played.piece] ?? 'piece';
    const h = hanging[0];
    const hangingName = PIECE_NAME[h.type] ?? 'piece';

    if (h.sq === played.to) {
      return `The ${movedName} moved to ${played.to} has no safe square — the opponent can capture it.`;
    }
    return `Moving the ${movedName} away from ${played.from} left the ${hangingName} on ${h.sq} undefended.`;
  } catch {
    return null;
  }
}

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
let followupPending = false;
let followupUci = null;
let currentBoard = null;

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
  followupPending = false;
  followupUci = null;
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

  initBoard(pos.fen, pos.sideToMove, pos.playedMoveUci);
}

async function initBoard(fen, sideToMove, playedMoveUci) {
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
  currentBoard = await createBoard(el, Chessboard, {
    position: fen,
    orientation: sideToMove === 'black' ? 'black' : 'white',
    onMove: ({ from, to }) => submitMove(from + to),
    getLegalMoves: () => currentLegalMoves,
  });
  // Show the move the player originally played (the bad one) as a red arrow
  if (playedMoveUci && playedMoveUci.length >= 4) {
    currentBoard.showArrow(playedMoveUci.slice(0, 2), playedMoveUci.slice(2, 4), 'danger');
  }
}

async function submitMove(uci) {
  if (followupPending) {
    followupPending = false;
    const correct = uci === followupUci;
    const wrap = document.getElementById('feedback-wrap');
    if (correct) {
      wrap.innerHTML = `<div class="drill-feedback drill-feedback--correct">
        <span class="drill-feedback__glyph">✓</span>
        <div>Follow-up correct.</div>
      </div>`;
    } else {
      wrap.innerHTML = `<div class="drill-feedback drill-feedback--wrong">
        <span class="drill-feedback__glyph">✗</span>
        <div>Not quite — that was the key follow-up.</div>
      </div>`;
    }
    showNextAfterDelay();
    return;
  }

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
    await showFeedback(result);
  } catch (err) {
    console.error('Attempt error:', err);
  }
}

async function showFeedback(result) {
  const wrap = document.getElementById('feedback-wrap');
  const correct = result.correct;

  if (correct) {
    document.getElementById('hint-btn').style.display = 'none';
    document.getElementById('skip-btn').style.display = 'none';

    const pos = positions[currentIdx];
    if (result.followupRequired && pos?.followupUci) {
      followupPending = true;
      followupUci = pos.followupUci;
      wrap.innerHTML = `<div class="drill-feedback drill-feedback--correct">
        <span class="drill-feedback__glyph">✓</span>
        <div>Correct. Now find the continuation.</div>
      </div>`;
      // Apply the best move to reach the follow-up position
      const { Chess } = await import('https://cdn.jsdelivr.net/npm/chess.js@1/+esm');
      const chess = new Chess(pos.fen);
      const from = pos.bestMoveUci.slice(0, 2);
      const to = pos.bestMoveUci.slice(2, 4);
      const promo = pos.bestMoveUci[4];
      chess.move({ from, to, ...(promo ? { promotion: promo } : {}) });
      const newSide = pos.sideToMove === 'white' ? 'black' : 'white';
      await initBoard(chess.fen(), newSide);
      return;
    }

    wrap.innerHTML = `<div class="drill-feedback drill-feedback--correct">
      <span class="drill-feedback__glyph">✓</span>
      <div>Correct.</div>
    </div>`;
    showNextAfterDelay();
  } else if (attemptNo === 1) {
    attemptNo = 2;
    startMs = Date.now();
    wrap.innerHTML = `<div class="drill-feedback drill-feedback--wrong">
      <span class="drill-feedback__glyph">✗</span>
      <div>Not the best. One more try.</div>
    </div>`;
    // Reset the board so the player can make a second attempt
    const pos = positions[currentIdx];
    if (pos) initBoard(pos.fen, pos.sideToMove);
  } else {
    // Teach
    wrap.innerHTML = `<div class="drill-feedback drill-feedback--wrong">
      <span class="drill-feedback__glyph">✗</span>
      <div>Best was <strong>${result.bestMoveSan}</strong>.
        ${result.winLoss != null ? `Lost ${Math.round(result.winLoss)}% win chance.` : ''}
      </div>
    </div>`;
    // Show best-move arrow on the board so the correct move is visible
    const pos = positions[currentIdx];
    if (pos?.bestMoveUci && currentBoard) {
      const from = pos.bestMoveUci.slice(0, 2);
      const to = pos.bestMoveUci.slice(2, 4);
      currentBoard.showArrow(from, to, 'success');
    }
    // Append one-sentence threat explanation if detectable
    if (pos?.fen && pos?.playedMoveSan && pos?.sideToMove) {
      let explain = await computeThreatExplanation(pos.fen, pos.playedMoveSan, pos.sideToMove);
      if (!explain) explain = pos?.motifExplanation ?? (pos?.motifTag ? MOTIF_EXPLANATION[pos.motifTag] : null) ?? null;
      if (explain) {
        wrap.insertAdjacentHTML('beforeend',
          `<div class="drill-feedback__explain">${explain}</div>`);
      }
    }
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
