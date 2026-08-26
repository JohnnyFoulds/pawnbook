/**
 * @module tui/screens/play
 * Play screen: board + right rail (opponent, clocks, move list, actions).
 *
 * The clock is server-authoritative. The TUI interpolates between
 * clock_update events for display only — it never decides flag-fall.
 * Clocks are hidden for untimed games.
 *
 * All game logic lives on the server. The TUI sends:
 *   { type: 'new_game', opponentId, color, ranked, timeControl }
 *   { type: 'move', uci }
 *   { type: 'resign' }
 *   { type: 'hint' }   (casual games only — server enforces)
 *   { type: 'resume', gameId }
 *
 * It renders whatever the server sends back.
 */

import { renderBoard } from '../board.js';
import { processKey, filterMoves } from '../input.js';
import { QUALITY } from '../../src/shared/quality.js';

const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

/**
 * @param {object} opts
 * @param {object} opts.client        — createClient result
 * @param {object} opts.renderOpts    — board render options (ascii, hatch, plain, etc.)
 * @param {boolean} [opts.showStreak] — from settings.show_streak
 * @returns {{ handleMessage: Function, handleKey: Function, render: Function }}
 */
export function createPlayScreen({ client, renderOpts = {} }) {
  const state = {
    fen:        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    legalMoves: [],
    lastFrom:   null,
    lastTo:     null,
    checkSq:    null,
    cursor:     null,
    flipped:    false,
    legalDots:  [],
    gameId:     null,
    youPlay:    'white',
    ranked:     true,

    opponentId: '—',
    opponentElo: null,
    moves:      [],  // { moveNum, white, black }
    thinking:   false,

    // Clocks — null means untimed
    clockWhiteMs: null,
    clockBlackMs: null,
    turn:         'white',
    clockLastUpdatedAt: null,

    result:       null,
    termination:  null,

    // Input
    input:       '',
    suggestions: [],

    // Analysis progress (post-game)
    analysisPhase:   null,
    analysisPct:     0,
  };

  // ── Message handler ──────────────────────────────────────────────────────

  function handleMessage(msg) {
    switch (msg.type) {
      case 'game_started':
        state.gameId     = msg.gameId;
        state.fen        = msg.fen;
        state.youPlay    = msg.youPlay;
        state.flipped    = msg.youPlay === 'black';
        state.legalMoves = msg.legalMoves ?? [];
        state.legalDots  = [];
        state.moves      = [];
        state.thinking   = false;
        state.result     = null;
        state.termination = null;
        state.clockWhiteMs = msg.clock?.whiteMs ?? null;
        state.clockBlackMs = msg.clock?.blackMs ?? null;
        state.turn         = 'white';
        state.clockLastUpdatedAt = Date.now();
        break;

      case 'engine_move':
        state.fen        = msg.fen;
        state.legalMoves = msg.legalMoves ?? [];
        state.thinking   = false;
        state.legalDots  = [];
        state.input      = '';
        appendMove(msg);
        if (msg.gameOver) handleGameOver(msg.gameOver);
        break;

      case 'clock_update':
        state.clockWhiteMs = msg.whiteMs;
        state.clockBlackMs = msg.blackMs;
        state.turn         = msg.turn;
        state.clockLastUpdatedAt = Date.now();
        break;

      case 'game_over':
        state.result      = msg.result;
        state.termination = msg.termination;
        state.thinking    = false;
        break;

      case 'hint_result':
        // Casual only — show the piece to move in the input line
        state.input = `Move your ${msg.pieceSquare.slice(0, 1).toUpperCase()}`;
        break;

      case 'analysis_progress':
        state.analysisPhase = msg.phase;
        state.analysisPct   = msg.overallPct ?? 0;
        break;

      case 'analysis_done':
        state.analysisPhase = null;
        state.analysisPct   = 100;
        break;
    }
  }

  function appendMove(msg) {
    const ply = state.moves.reduce((n, m) => n + (m.white ? 1 : 0) + (m.black ? 1 : 0), 0) + 1;
    const moveNum = Math.ceil(ply / 2);
    if (ply % 2 === 1) {
      state.moves.push({ moveNum, white: msg.san, black: null });
    } else {
      const last = state.moves[state.moves.length - 1];
      if (last) last.black = msg.san;
    }
  }

  function handleGameOver(go) {
    state.result      = go.result;
    state.termination = go.termination;
  }

  // ── Key handler ──────────────────────────────────────────────────────────

  function handleKey(key) {
    if (state.result) return; // game over — ignore

    if (key === 'f' || key === 'F') {
      state.flipped = !state.flipped;
      return;
    }

    const next = processKey(
      { buffer: state.input, legalMoves: state.legalMoves },
      key,
    );
    state.input = next.buffer;
    state.suggestions = filterMoves(state.legalMoves, state.input).slice(0, 6);

    if (next.submitted) {
      client.send({ type: 'move', uci: next.submitted.uci });
      state.thinking = true;
      state.input = '';
      state.suggestions = [];
    }
  }

  // ── Clock display ────────────────────────────────────────────────────────

  function formatMs(ms) {
    if (ms == null) return '';
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /** Interpolate clock display based on elapsed time since last server update. */
  function interpolatedClock(color) {
    const ms = color === 'white' ? state.clockWhiteMs : state.clockBlackMs;
    if (ms == null) return null;
    const elapsed = state.turn === color
      ? Date.now() - (state.clockLastUpdatedAt ?? Date.now())
      : 0;
    return Math.max(0, ms - elapsed);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  function render() {
    const boardLines = renderBoard(state, renderOpts);
    const railLines  = buildRail();
    const lines = [];

    for (let i = 0; i < Math.max(boardLines.length, railLines.length); i++) {
      const bl = (boardLines[i] ?? '').padEnd(37);
      const rl = railLines[i] ?? '';
      lines.push(bl + rl);
    }

    const inputLine = buildInputLine();
    lines.push('─'.repeat(72));
    lines.push(inputLine);

    return lines.join('\n');
  }

  function buildRail() {
    const lines = [];

    // Opponent
    const oppElo = state.opponentElo != null ? ` · ELO ${state.opponentElo}` : '';
    lines.push(BOLD + state.opponentId + RESET + oppElo);
    lines.push(state.thinking ? '● thinking…' : '○');
    lines.push('─'.repeat(33));

    // Move list (last 8 pairs)
    const recent = state.moves.slice(-8);
    for (const m of recent) {
      const wSan = (m.white ?? '').padEnd(8);
      const bSan = (m.black ?? '');
      lines.push(`  ${m.moveNum}.  ${wSan}  ${bSan}`);
    }
    while (lines.length < 12) lines.push('');
    lines.push('─'.repeat(33));

    // Clocks (only when timed)
    const whiteMs = interpolatedClock('white');
    const blackMs = interpolatedClock('black');
    if (whiteMs != null) {
      const oppColor = state.youPlay === 'white' ? 'black' : 'white';
      const oppMs    = oppColor === 'white' ? whiteMs : blackMs;
      const youMs    = state.youPlay === 'white' ? whiteMs : blackMs;
      const oppPip   = state.turn === oppColor ? '●' : '○';
      const youPip   = state.turn === state.youPlay ? '●' : '○';
      lines.push(`${state.opponentId.slice(0, 16).padEnd(16)} ${oppPip}  ${formatMs(oppMs)}`);
      lines.push(`You · ${state.youPlay.charAt(0).toUpperCase() + state.youPlay.slice(1)}  ${youPip}  ${formatMs(youMs)}`);
      lines.push('─'.repeat(33));
    }

    // Result
    if (state.result) {
      const resultStr = state.result === 'win' ? 'You won' : state.result === 'loss' ? 'You lost' : 'Draw';
      lines.push(BOLD + resultStr + RESET);
      if (state.termination) lines.push(state.termination.replace('_', ' '));
    }

    return lines;
  }

  function buildInputLine() {
    const sug = state.suggestions.map((m) => m.san).join('  ');
    const buf = state.input + '▏';
    return `move › ${buf.padEnd(18)} ${sug.slice(0, 40)}`;
  }

  return { handleMessage, handleKey, render };
}
