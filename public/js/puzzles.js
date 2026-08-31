/**
 * @module public/js/puzzles
 * Drill page: batches of 10, empty-state win, batch summary.
 * Uses the same attempt endpoint as quiz.js but with phase:'drill'.
 * Feedback leads with glyph/word — never colour alone.
 * Scheduling is handled server-side; client never calls the scheduler.
 */


const BASE = '';
const BATCH_SIZE = 10;
const DUE_SOFT_CAP = 40;

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

/**
 * Given the puzzle FEN (before the mistake), the played SAN, and the player's
 * side, return a one-sentence explanation of why the move was bad, or null if
 * no obvious threat is detected.
 */
async function computeThreatExplanation(fen, playedMoveSan, sideToMove) {
  try {
    const { Chess } = await import('https://cdn.jsdelivr.net/npm/chess.js@1/+esm');
    const chess = new Chess(fen);
    const playerColor = sideToMove === 'white' ? 'w' : 'b';
    const oppColor = playerColor === 'w' ? 'b' : 'w';

    const played = chess.move(playedMoveSan);
    if (!played) return null;

    // Find player pieces that are now hanging (attacked and not sufficiently defended).
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

let batch = [];
let batchIdx = 0;
let solved = 0;
let missed = 0;
let attemptNo = 1;
let hintUsed = false;
let startMs = 0;
let currentLegalMoves = [];  // UCI strings for the current puzzle position
let followupPending = false;
let followupUci = null;
let isDrillAhead = false;
let currentBoard = null;

async function boot() {
  try {
    const motifFilter = new URLSearchParams(location.search).get('motif');
    const duePath = motifFilter ? `/api/puzzles/due?motif=${encodeURIComponent(motifFilter)}` : '/api/puzzles/due';
    const due = await api(duePath);
    const cards = due.cards ?? [];
    const total = due.total ?? cards.length;

    // Show filter banner if drilling a specific motif
    if (motifFilter) {
      const banner = document.getElementById('motif-filter-banner');
      const labelEl = document.getElementById('motif-filter-label');
      if (banner) banner.style.display = '';
      if (labelEl) labelEl.textContent = motifFilter.replace(/_/g, ' ');
    }

    // Update badge
    const dueLabel = total > DUE_SOFT_CAP ? `${DUE_SOFT_CAP}+` : String(total);
    document.querySelectorAll('#due-count').forEach((el) => { el.textContent = dueLabel; });

    if (!cards.length) {
      document.getElementById('empty-state').style.display = '';
      return;
    }

    batch = cards.slice(0, BATCH_SIZE);
    isDrillAhead = false;
    document.getElementById('drill-ui').style.display = '';
    document.getElementById('batch-total').textContent = String(batch.length);
    renderPips();
    loadCard(0);
  } catch (err) {
    console.error('Puzzles boot error:', err);
    document.getElementById('empty-state').style.display = '';
  }
}

async function bootPractice() {
  try {
    const data = await api('/api/puzzles/practice');
    const cards = data.cards ?? [];

    if (!cards.length) {
      document.getElementById('empty-state').style.display = '';
      document.getElementById('empty-state').querySelector('.empty-state__message').textContent =
        'No practice cards available — play a game first.';
      return;
    }

    batch = cards.slice(0, BATCH_SIZE);
    isDrillAhead = true;
    solved = 0;
    missed = 0;
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('drill-ui').style.display = '';
    document.getElementById('batch-total').textContent = String(batch.length);
    renderPips();
    loadCard(0);
  } catch (err) {
    console.error('Practice boot error:', err);
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
  followupPending = false;
  followupUci = null;
  startMs = Date.now();

  document.getElementById('batch-progress').textContent = String(idx + 1);
  updateCurrentPip(idx);

  const gameLink = document.getElementById('game-link');
  gameLink.href = `review.html?game=${card.sourceGameId}`;

  const isOpening = card.kind === 'opening';
  const moveLabel = `Move ${Math.ceil(card.ply / 2)}${card.ply % 2 === 1 ? '.' : '…'}  ${card.sideToMove === 'white' ? 'White' : 'Black'} to play`;
  document.getElementById('move-label').textContent = isOpening
    ? `Opening — ${moveLabel}`
    : moveLabel;

  document.getElementById('drill-prompt').innerHTML = isOpening
    ? `Your book move here is <span class="drill-prompt__move">${card.bestMoveSan ?? '?'}</span>.`
    : (`You played <span class="drill-prompt__move">${card.playedMoveSan}</span> here and `
    + `lost ${card.winLoss != null ? Math.round(card.winLoss) : '?'}% win chance.<br>`
    + 'Find something better.');

  document.getElementById('feedback-wrap').innerHTML = '';
  document.getElementById('action-btns').style.display = 'flex';
  document.getElementById('hint-btn').disabled = false;
  document.getElementById('hint-btn').textContent = 'Show hint';
  document.getElementById('next-wrap').style.display = 'none';

  initBoard(card.fen, card.sideToMove);
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
  currentBoard = await createBoard(el, Chessboard, {
    position: fen,
    orientation: sideToMove === 'black' ? 'black' : 'white',
    onMove: ({ from, to }) => submitMove(from + to),
    getLegalMoves: () => currentLegalMoves,
  });
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
    autoAdvance();
    return;
  }

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
        phase: isDrillAhead ? 'quiz' : 'drill',
      }),
    });
    await showFeedback(result, card);
  } catch (err) {
    console.error('Attempt error:', err);
  }
}

async function showFeedback(result, _card) {
  const wrap = document.getElementById('feedback-wrap');
  const correct = result.correct;
  const pip = document.getElementById(`pip-${batchIdx}`);

  if (correct) {
    solved++;
    if (pip) { pip.classList.remove('drill-pip--current'); pip.classList.add('drill-pip--solved'); }
    document.getElementById('action-btns').style.display = 'none';

    const card = batch[batchIdx];
    if (result.followupRequired && card?.followupUci) {
      followupPending = true;
      followupUci = card.followupUci;
      wrap.innerHTML = `<div class="drill-feedback drill-feedback--correct">
        <span class="drill-feedback__glyph">✓</span>
        <div>Correct. Now find the continuation.</div>
      </div>`;
      const { Chess } = await import('https://cdn.jsdelivr.net/npm/chess.js@1/+esm');
      const chess = new Chess(card.fen);
      const from = card.bestMoveUci.slice(0, 2);
      const to = card.bestMoveUci.slice(2, 4);
      const promo = card.bestMoveUci[4];
      chess.move({ from, to, ...(promo ? { promotion: promo } : {}) });
      const newSide = card.sideToMove === 'white' ? 'black' : 'white';
      await initBoard(chess.fen(), newSide);
      return;
    }

    wrap.innerHTML = `<div class="drill-feedback drill-feedback--correct">
      <span class="drill-feedback__glyph">✓</span>
      <div>Correct.</div>
    </div>`;
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
    // Show best-move arrow on the board so the correct move is visible
    const card = batch[batchIdx];
    if (card?.bestMoveUci && currentBoard) {
      const from = card.bestMoveUci.slice(0, 2);
      const to = card.bestMoveUci.slice(2, 4);
      currentBoard.showArrow(from, to, 'success');
    }
    // Append one-sentence threat explanation if detectable
    if (card?.fen && card?.playedMoveSan && card?.sideToMove) {
      let explain = await computeThreatExplanation(card.fen, card.playedMoveSan, card.sideToMove);
      if (!explain) explain = card?.motifExplanation ?? (card?.motifTag ? MOTIF_EXPLANATION[card.motifTag] : null) ?? null;
      if (explain) {
        wrap.insertAdjacentHTML('beforeend',
          `<div class="drill-feedback__explain">${explain}</div>`);
      }
    }
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
  if (isDrillAhead) {
    await bootPractice();
  } else {
    await boot();
  }
});

const drillAheadBtn = document.getElementById('drill-ahead-btn');
if (drillAheadBtn) {
  drillAheadBtn.addEventListener('click', () => bootPractice());
}

boot();
