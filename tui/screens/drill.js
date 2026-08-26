/**
 * @module tui/screens/drill
 * Drill screen: batches of 10 from /api/puzzles/due.
 *
 * Flow is identical to the browser: one retry then teach.
 * Feedback MUST lead with ✓/✗ glyph — never colour alone.
 * This rule holds even in --plain (no ANSI colour) and --ascii.
 *
 * The TUI sends { move, msTaken, hintUsed, attemptNo, phase: 'drill' }
 * to POST /api/puzzles/:id/attempt. The server derives correct/rating.
 * The TUI NEVER computes correctness or FSRS rating.
 */

import { renderBoard } from '../board.js';
import { processKey } from '../input.js';
import { RESET, BOLD } from '../theme.js';
import { DUE_SOFT_CAP, DRILL_BATCH as BATCH_SIZE } from '../../src/shared/balance.js';

/**
 * @param {object} opts
 * @param {string} opts.host
 * @param {object} opts.renderOpts
 * @param {Function} opts.apiCall
 * @returns {{ boot: Function, handleKey: Function, render: Function }}
 */
export function createDrillScreen({ host, renderOpts = {}, apiCall }) {
  const state = {
    batch:      [],
    batchIdx:   0,
    solved:     0,
    missed:     0,
    attemptNo:  1,
    hintUsed:   false,
    startMs:    0,

    fen:        null,
    legalMoves: [],
    input:      '',

    feedback:   null,  // { glyph: '✓'|'✗', text: string, correct: boolean }
    done:       false,
    summary:    null,  // { solved, missed }
    empty:      false,
    error:      null,
  };

  async function boot() {
    try {
      const due = await apiCall(host, '/api/puzzles/due');
      const cards = due.cards ?? [];
      const total = due.total ?? cards.length;

      if (!cards.length) {
        state.empty = true;
        return;
      }

      state.batch = cards.slice(0, BATCH_SIZE);
      loadCard(0);
    } catch (err) {
      state.error = String(err.message ?? err);
    }
  }

  function loadCard(idx) {
    if (idx >= state.batch.length) {
      state.done = true;
      state.summary = { solved: state.solved, missed: state.missed };
      return;
    }
    state.batchIdx  = idx;
    state.attemptNo = 1;
    state.hintUsed  = false;
    state.startMs   = Date.now();
    state.feedback  = null;
    state.input     = '';

    const card = state.batch[idx];
    state.fen        = card.fen;
    state.legalMoves = card.legalMoves ?? [];
  }

  async function submitMove(uci) {
    const card = state.batch[state.batchIdx];
    const msTaken = Date.now() - state.startMs;
    try {
      const result = await apiCall(host, `/api/puzzles/${card.puzzleId}/attempt`, {
        method: 'POST',
        body: { move: uci, msTaken, hintUsed: state.hintUsed, attemptNo: state.attemptNo, phase: 'drill' },
      });
      handleResult(result);
    } catch (err) {
      state.feedback = { glyph: '✗', text: `Error: ${err.message}`, correct: false };
    }
  }

  function handleResult(result) {
    if (result.correct) {
      state.solved++;
      state.feedback = {
        glyph: '✓',
        text: 'Correct.' + (result.followupRequired ? ' Find the continuation.' : ''),
        correct: true,
      };
    } else if (state.attemptNo === 1) {
      state.attemptNo = 2;
      state.feedback = { glyph: '✗', text: 'Not the best. One more try.', correct: false };
    } else {
      state.missed++;
      const loss = result.winLoss != null ? ` Lost ${Math.round(result.winLoss)}% win.` : '';
      state.feedback = {
        glyph: '✗',
        text: `Best was ${result.bestMoveSan}.${loss}`,
        correct: false,
      };
    }
  }

  function handleKey(key) {
    if (state.done || state.empty) {
      if (key === 'ENTER' || key === '\r') {
        // restart
        state.batch = []; state.batchIdx = 0; state.solved = 0; state.missed = 0;
        state.done = false; state.summary = null; state.empty = false;
        boot();
      }
      return;
    }

    // h = hint
    if ((key === 'h' || key === 'H') && !state.feedback) {
      state.hintUsed = true;
      const card = state.batch[state.batchIdx];
      state.input = `Move your ${card?.piece ?? '?'}`;
      return;
    }

    // s = skip
    if ((key === 's' || key === 'S') && !state.feedback) {
      state.missed++;
      loadCard(state.batchIdx + 1);
      return;
    }

    // n / Enter after feedback
    if ((key === 'n' || key === 'N' || key === 'ENTER' || key === '\r') && state.feedback) {
      loadCard(state.batchIdx + 1);
      return;
    }

    if (state.feedback) return; // waiting for 'n'

    const next = processKey({ buffer: state.input, legalMoves: state.legalMoves }, key);
    state.input = next.buffer;

    if (next.submitted) {
      submitMove(next.submitted.uci);
      state.input = '';
    }
  }

  function render() {
    const lines = [];

    if (state.error) {
      lines.push('Error: ' + state.error);
      return lines.join('\n');
    }

    if (state.empty) {
      lines.push('Nothing due — you\'re clear.');
      lines.push('Play a game or drill ahead.  [Enter] to refresh');
      return lines.join('\n');
    }

    if (state.done && state.summary) {
      lines.push(BOLD + 'Batch complete' + RESET);
      lines.push(`${state.summary.solved} solved · ${state.summary.missed} missed`);
      lines.push('[Enter] for next batch   [q] quit');
      return lines.join('\n');
    }

    const card = state.batch[state.batchIdx];
    const header = ` drill · ${state.batchIdx + 1} of ${state.batch.length}`;
    lines.push(header);
    lines.push('');

    if (state.fen) {
      const boardLines = renderBoard(
        { fen: state.fen, legalMoves: state.legalMoves, legalDots: [] },
        renderOpts,
      );
      boardLines.forEach((l) => lines.push(l));
    }

    lines.push('');

    if (card) {
      const sideStr = card.sideToMove === 'white' ? 'White' : 'Black';
      lines.push(`Move ${Math.ceil(card.ply / 2)}  ${sideStr} to play`);
      lines.push(`You played ${card.playedMoveSan} — lost ${card.winLoss != null ? Math.round(card.winLoss) : '?'}% win chance.`);
      lines.push('Find something better.');
    }

    lines.push('');

    // Pip row
    const pips = state.batch.map((_, i) => {
      if (i < state.batchIdx) return '●';
      if (i === state.batchIdx) return '◎';
      return '○';
    }).join(' ');
    lines.push(pips);

    if (state.feedback) {
      const { glyph, text } = state.feedback;
      lines.push('');
      // Glyph leads — never colour alone
      lines.push(`${glyph} ${text}`);
      lines.push('[n] next');
    } else {
      lines.push('');
      lines.push(`move › ${state.input}▏`);
      lines.push('[h] hint   [s] skip');
    }

    return lines.join('\n');
  }

  return { boot, handleKey, render };
}
