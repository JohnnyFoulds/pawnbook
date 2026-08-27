/**
 * @module public/js/play
 * Play page: opponent setup, WebSocket game lifecycle, board interaction,
 * clock display, result card with analysis progress.
 *
 * Integrity rules (enforced by the server, not the client):
 * - No eval, no hint, no move quality during a ranked game.
 * - legalMoves comes from the server as [{uci, san}].
 * - Clock authority is the server; client only displays.
 */

const WS_URL = `ws://${location.host}/ws`;
const BASE = '';

async function api(path, opts) {
  const r = await fetch(BASE + path, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── State ──────────────────────────────────────────────────────────────────

let ws = null;
let gameId = null;
let currentFen = null;
let legalMoves = [];
let youPlay = null;
let selectedOpponentId = null;
let selectedColor = 'random';
let selectedTc = null;
let ranked = true;
let board = null;
let isRanked = true;
let analysisRunning = false;

// Resolved when the board DOM is initialised and ready to receive setPosition calls.
// Prevents engine_move updates being lost when player is black and the engine
// replies before the CDN import for cm-chessboard has finished.
let _boardReadyResolve = null;
let _boardReady = Promise.resolve(); // default: already resolved (no-op for first call)

// ── Boot ───────────────────────────────────────────────────────────────────

async function boot() {
  try {
    const [{ opponents }, state] = await Promise.all([
      api('/api/opponents'),
      api('/api/state'),
    ]);

    renderOpponents(opponents, state.elo ?? 1200);

    document.getElementById('elo-display').textContent =
      `${state.elo ?? 1200} vs engines`;

    const dueCount = state.dueCount ?? 0;
    document.querySelectorAll('#due-count').forEach((el) => { el.textContent = String(dueCount); });

    // Auto-resume an in-progress game after page refresh
    if (state.inProgressGameId) {
      selectedOpponentId = state.inProgressOpponentId ?? state.inProgressGameId;
      document.getElementById('setup-panel').style.display = 'none';
      document.getElementById('game-area').style.display = 'block';
      connectWS(() => {
        ws.send(JSON.stringify({ type: 'resume', gameId: state.inProgressGameId }));
      });
      setupSetupHandlers();
      return;
    }
  } catch (err) {
    console.error('Boot error:', err);
  }

  setupSetupHandlers();
}

// ── Opponent grid ──────────────────────────────────────────────────────────

function renderOpponents(opponents, myElo) {
  const groups = { maia: [], sf: [], novelty: [] };
  opponents.forEach((o) => {
    if (o.id.startsWith('maia')) groups.maia.push(o);
    else if (o.id.startsWith('sf')) groups.sf.push(o);
    else groups.novelty.push(o);
  });

  renderGroup('maia-grid', groups.maia, myElo);
  renderGroup('sf-grid', groups.sf, myElo);
  renderGroup('novelty-grid', groups.novelty, myElo);

  // Pre-select closest to myElo
  const all = opponents.filter((o) => o.elo != null);
  if (all.length) {
    const closest = all.reduce((a, b) =>
      Math.abs(a.elo - myElo) < Math.abs(b.elo - myElo) ? a : b);
    selectOpponent(closest);
  }
}

function renderGroup(containerId, opponents, myElo) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  opponents.forEach((o) => {
    const even = o.elo != null && Math.abs(o.elo - myElo) <= 150;
    const btn = document.createElement('button');
    btn.className = 'opponent-chip' + (even ? ' opponent-chip--even' : '');
    btn.dataset.id = o.id;
    btn.innerHTML = `
      <div class="opponent-chip__name">${o.name}</div>
      <div class="opponent-chip__elo">${o.elo != null ? 'ELO ' + o.elo : 'Unrated'}${even ? ' · Even match' : ''}</div>
      ${o.note ? `<div class="opponent-chip__note">${o.note}</div>` : ''}
    `;
    btn.addEventListener('click', () => selectOpponent(o));
    el.appendChild(btn);
  });
}

function selectOpponent(o) {
  selectedOpponentId = o.id;
  document.querySelectorAll('.opponent-chip').forEach((c) => {
    c.classList.toggle('opponent-chip--selected', c.dataset.id === o.id);
  });

  const isDrawfish = o.id === 'drawfish';
  const rankedWrap = document.getElementById('ranked-wrap');
  const drawfishNote = document.getElementById('drawfish-note');
  if (isDrawfish) {
    rankedWrap.style.display = 'none';
    drawfishNote.style.display = '';
    drawfishNote.textContent = o.note ?? 'unrated · plays for stalemate, so a rating against it would mean nothing';
    ranked = false;
  } else {
    rankedWrap.style.display = '';
    drawfishNote.style.display = 'none';
    ranked = document.getElementById('ranked-toggle').checked;
  }
}

// ── Setup handlers ─────────────────────────────────────────────────────────

function setupSetupHandlers() {
  document.getElementById('color-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    selectedColor = btn.dataset.color;
    document.querySelectorAll('[data-color]').forEach((b) =>
      b.classList.toggle('color-chip--selected', b === btn));
  });

  document.getElementById('time-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tc]');
    if (!btn) return;
    selectedTc = btn.dataset.tc === 'null' ? null : btn.dataset.tc.split(',').map(Number);
    document.querySelectorAll('[data-tc]').forEach((b) =>
      b.classList.toggle('time-chip--selected', b === btn));
  });

  document.getElementById('ranked-toggle').addEventListener('change', (e) => {
    ranked = e.target.checked;
  });

  document.getElementById('start-btn').addEventListener('click', startGame);
}

// ── Start game ─────────────────────────────────────────────────────────────

function startGame() {
  if (!selectedOpponentId) {
    alert('Select an opponent first.');
    return;
  }

  document.getElementById('setup-panel').style.display = 'none';
  document.getElementById('game-area').style.display = 'block';
  isRanked = ranked;

  connectWS(() => {
    ws.send(JSON.stringify({
      type: 'new_game',
      opponentId: selectedOpponentId,
      color: selectedColor,
      ranked: ranked,
      timeControl: selectedTc
        ? { initialSec: selectedTc[0], incSec: selectedTc[1] }
        : null,
    }));
  });
}

// ── WebSocket ──────────────────────────────────────────────────────────────

function connectWS(onOpen) {
  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    if (onOpen) onOpen();
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handleMessage(msg);
  });

  ws.addEventListener('close', () => {
    if (gameId && !analysisRunning) {
      // Attempt reconnect after a short delay
      setTimeout(() => connectWS(() => {
        ws.send(JSON.stringify({ type: 'resume', gameId }));
      }), 2000);
    }
  });
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'game_started':
      onGameStarted(msg);
      break;
    case 'engine_move':
      onEngineMove(msg);
      break;
    case 'hint_result':
      onHintResult(msg);
      break;
    case 'clock_update':
      onClockUpdate(msg);
      break;
    case 'game_over':
      onGameOver(msg);
      break;
    case 'analysis_progress':
      onAnalysisProgress(msg);
      break;
    case 'analysis_done':
      onAnalysisDone(msg);
      break;
    case 'error':
      console.error('Server error:', msg.message);
      break;
  }
}

// ── Game events ────────────────────────────────────────────────────────────

function onGameStarted(msg) {
  gameId = msg.gameId;
  youPlay = msg.youPlay;
  currentFen = msg.fen;
  legalMoves = msg.legalMoves ?? [];

  document.getElementById('opponent-name-display').textContent = selectedOpponentId;
  document.getElementById('opp-name-clock').textContent = selectedOpponentId;

  initBoard(msg.fen, youPlay);

  if (msg.clock) showClocks(msg.clock);
  if (!isRanked) document.getElementById('hint-btn').style.display = '';
}

async function onEngineMove(msg) {
  currentFen = msg.fen;
  legalMoves = msg.legalMoves ?? [];
  document.getElementById('thinking-display').style.display = 'none';

  // Wait for the board to be ready — this handles the race where the engine
  // (especially Maia, which is very fast) replies before initBoard's CDN
  // imports have finished, e.g. when the player is black and engine moves first.
  await _boardReady;

  if (board) {
    board.clearMarkers();
    board.setPosition(msg.fen, msg.uci?.slice(0, 2), msg.uci?.slice(2, 4));
  }

  appendMoveToList(msg.san, 'opponent', msg.check);

  if (msg.clock) onClockUpdate(msg.clock);
  if (msg.gameOver) return;

  // Player's turn
}

function onHintResult(msg) {
  const sq = msg.pieceSquare;
  if (board && sq) board.showCheck(sq); // reuse check marker style for hint highlight
}

function onClockUpdate(clock) {
  showClocks(clock);
}

function onGameOver(msg) {
  const strings = {
    checkmate: 'by checkmate', resignation: 'by resignation',
    stalemate: 'by stalemate', threefold: 'by threefold repetition',
    fifty_move: 'by fifty-move rule', insufficient_material: 'by insufficient material',
    timeout: 'on time', abandoned: 'game abandoned',
  };

  let outcome, cls;
  if (msg.result === 'win')       { outcome = 'You won';  cls = 'result-card__outcome--won'; }
  else if (msg.result === 'loss') { outcome = 'You lost'; cls = 'result-card__outcome--lost'; }
  else                            { outcome = 'Draw';     cls = ''; }

  const outcomeEl = document.getElementById('result-outcome');
  outcomeEl.textContent = outcome;
  outcomeEl.className = 'result-card__outcome ' + cls;

  document.getElementById('result-termination').textContent = strings[msg.termination] ?? '';

  if (msg.eloBefore != null && msg.eloAfter != null) {
    const delta = msg.eloAfter - msg.eloBefore;
    document.getElementById('result-elo').textContent =
      `ELO  ${msg.eloBefore} → ${msg.eloAfter}  ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}`;
  }

  const overlay = document.getElementById('result-overlay');
  overlay.style.display = 'flex';
  analysisRunning = true;

  document.getElementById('review-link').href = `review.html?game=${gameId}`;
  document.getElementById('quiz-link')?.setAttribute('href', `quiz.html?game=${gameId}`);

  document.getElementById('play-again-btn').addEventListener('click', () => {
    overlay.style.display = 'none';
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('setup-panel').style.display = '';
    gameId = null;
    analysisRunning = false;
  });
}

function onAnalysisProgress(msg) {
  const pct = msg.overallPct ?? 0;
  document.getElementById('analysis-progress').style.width = pct + '%';
  document.getElementById('analysis-label').textContent =
    `Analysing… ${msg.phase ?? ''} ${Math.round(pct)}%`;
}

function onAnalysisDone(msg) {
  document.getElementById('analysis-label').textContent = 'Analysis complete';
  document.getElementById('analysis-progress').style.width = '100%';
  const count = msg.puzzleCount ?? 0;
  const reviewLink = document.getElementById('review-link');
  if (reviewLink && count > 0) {
    reviewLink.textContent = `Review & quiz (${count} positions)`;
    reviewLink.href = `quiz.html?game=${gameId}`;
  }
}

// ── Board ──────────────────────────────────────────────────────────────────

async function initBoard(fen, orientation) {
  // Reset the ready gate — any engine_move that arrives while the CDN is loading
  // will await this promise and apply the position once the board exists.
  _boardReady = new Promise(resolve => { _boardReadyResolve = resolve; });

  const el = document.getElementById('board-wrap');
  el.innerHTML = '';

  const [{ Chessboard }, { createBoard }] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/Chessboard.js'),
    import('./lib/board.js'),
  ]);
  board = await createBoard(el, Chessboard, {
    position: fen,
    orientation,
    onMove: handlePlayerMove,
    getLegalMoves: () => legalMoves.map(m => m.uci),
  });

  _boardReadyResolve();
}

function handlePlayerMove({ from, to }) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const matchedMoves = legalMoves.filter((m) => m.uci.startsWith(from + to));
  if (!matchedMoves.length) return;

  let uci = from + to;
  // Promotion: if multiple matches, default to queen
  if (matchedMoves.length > 1) uci += 'q';

  document.getElementById('thinking-display').style.display = 'flex';
  ws.send(JSON.stringify({ type: 'move', uci }));
  appendMoveToList(matchedMoves[0]?.san ?? uci, 'player', false);
  // Board already shows the piece in its new square via cm-chessboard's drag animation.
  // onEngineMove will setPosition with the correct FEN once the engine replies.
}

// ── Move list ──────────────────────────────────────────────────────────────

let plyCount = 0;

function appendMoveToList(san, side, check) {
  plyCount++;
  const list = document.getElementById('move-list');
  if (plyCount % 2 === 1) {
    const row = document.createElement('div');
    row.className = 'move-list__row';
    row.dataset.plyGroup = String(Math.ceil(plyCount / 2));
    row.innerHTML = `<span class="move-list__num">${Math.ceil(plyCount / 2)}.</span>
      <span class="move-list__move">${san}${check ? '+' : ''}</span>
      <span class="move-list__move" id="ml-black-${Math.ceil(plyCount / 2)}"></span>`;
    list.appendChild(row);
  } else {
    const slot = document.getElementById(`ml-black-${Math.floor(plyCount / 2)}`);
    if (slot) slot.textContent = san + (check ? '+' : '');
  }
  list.scrollTop = list.scrollHeight;
}

// ── Clocks ─────────────────────────────────────────────────────────────────

function showClocks(clock) {
  if (!clock) return;
  const youEl = document.getElementById('clock-you');
  const oppEl = document.getElementById('clock-opp');
  youEl.style.display = 'flex';
  oppEl.style.display = 'flex';

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  if (youPlay === 'white') {
    document.getElementById('clock-you-time').textContent = fmt(clock.whiteMs);
    document.getElementById('clock-opp-time').textContent = fmt(clock.blackMs);
  } else {
    document.getElementById('clock-you-time').textContent = fmt(clock.blackMs);
    document.getElementById('clock-opp-time').textContent = fmt(clock.whiteMs);
  }

  const yourTurn = (clock.turn === 'white') === (youPlay === 'white');
  youEl.querySelector('.clock-row__pip').classList.toggle('clock-row__pip--active', yourTurn);
  oppEl.querySelector('.clock-row__pip').classList.toggle('clock-row__pip--active', !yourTurn);
}

// ── Action buttons ─────────────────────────────────────────────────────────

document.getElementById('flip-btn').addEventListener('click', () => board?.flip());

document.getElementById('hint-btn').addEventListener('click', () => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'hint' }));
});

document.getElementById('resign-btn').addEventListener('click', () => {
  if (!confirm('Resign this game?')) return;
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resign' }));
});

// ── Boot ───────────────────────────────────────────────────────────────────

boot();
