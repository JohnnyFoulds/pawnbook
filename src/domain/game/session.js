/**
 * @module domain/game/session
 * Game session: move validation, termination, clock management.
 * Pure domain logic — no engine calls, no persistence here.
 */

import { randomUUID } from 'crypto';

import { Chess } from 'chess.js';

import {
  IllegalMoveError, GameAlreadyOverError, GameNotResumableError, HintNotAllowedError,
} from '../../errors.js';

const TERMINATION_MAP = {
  isCheckmate: 'checkmate',
  isStalemate: 'stalemate',
  isThreefoldRepetition: 'threefold',
  isInsufficientMaterial: 'insufficient_material',
  isDrawByFiftyMoves: 'fifty_move',
};

export class GameSession {
  /**
   * @param {object} opts
   * @param {string} opts.gameId
   * @param {object} opts.opponent  — roster entry
   * @param {'white'|'black'} opts.playerColor
   * @param {boolean} opts.ranked
   * @param {{initialSec: number, incSec: number}|null} opts.timeControl
   * @param {import('../..ports/clock.js').Clock} opts.clock
   */
  constructor({ gameId, opponent, playerColor, ranked, timeControl, clock }) {
    this.id = gameId ?? randomUUID();
    this.opponent = opponent;
    this.playerColor = playerColor;
    this.ranked = ranked && opponent.elo !== null;
    this.timeControl = timeControl ?? null;
    this.clock = clock;
    this._chess = new Chess();
    this._status = 'in_progress';
    this._moves = [];
    this._startedAt = clock.now();
    this._clockWhiteMs = timeControl ? timeControl.initialSec * 1000 : null;
    this._clockBlackMs = timeControl ? timeControl.initialSec * 1000 : null;
    this._lastMoveAt = this._startedAt;
    this.alertsInGame = 0;
  }

  get status() { return this._status; }
  get fen() { return this._chess.fen(); }
  get isOver() { return this._status !== 'in_progress'; }
  get moves() { return this._moves; }
  /** True when it is the human player's turn to move. */
  get isPlayerTurn() {
    const turnColor = this._chess.turn() === 'w' ? 'white' : 'black';
    return turnColor === this.playerColor;
  }

  /** @returns {{uci: string, san: string}[]} */
  get legalMoves() {
    return this._chess.moves({ verbose: true }).map(m => ({
      uci: m.from + m.to + (m.promotion ?? ''),
      san: m.san,
    }));
  }

  /**
   * Apply a player move. Returns result info.
   * @param {string} uci
   * @returns {{san: string, fen: string, legalMoves: object[], gameOver: boolean, result?: object, clockUpdate?: object}}
   */
  applyMove(uci) {
    if (this.isOver) throw new GameAlreadyOverError(`Game '${this.id}' is already over`);

    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci[4] || undefined;

    let move;
    try {
      move = this._chess.move({ from, to, promotion });
    } catch {
      throw new IllegalMoveError(`Illegal move '${uci}' in game '${this.id}'`);
    }
    if (!move) throw new IllegalMoveError(`Illegal move '${uci}' in game '${this.id}'`);

    const now = this.clock.now();
    const elapsed = now.getTime() - this._lastMoveAt.getTime();

    if (this.timeControl) {
      const isWhiteMove = move.color === 'w';
      if (isWhiteMove) {
        this._clockWhiteMs -= elapsed;
        this._clockWhiteMs += this.timeControl.incSec * 1000;
      } else {
        this._clockBlackMs -= elapsed;
        this._clockBlackMs += this.timeControl.incSec * 1000;
      }
    }
    this._lastMoveAt = now;

    this._moves.push({
      ply: this._moves.length + 1,
      uci,
      san: move.san,
      msTaken: elapsed,
    });

    const gameOverResult = this._checkGameOver();

    return {
      san: move.san,
      fen: this._chess.fen(),
      legalMoves: this.legalMoves,
      check: this._chess.inCheck(),
      gameOver: !!gameOverResult,
      result: gameOverResult ?? undefined,
      clockUpdate: this.timeControl ? {
        whiteMs: this._clockWhiteMs,
        blackMs: this._clockBlackMs,
        turn: this._chess.turn() === 'w' ? 'white' : 'black',
      } : undefined,
    };
  }

  /**
   * Flag-fall: debit remaining time and check for timeout.
   * @param {'white'|'black'} color
   * @returns {{termination: 'timeout', result: string}|null}
   */
  checkTimeout(color) {
    if (!this.timeControl || this.isOver) return null;
    const ms = color === 'white' ? this._clockWhiteMs : this._clockBlackMs;
    if (ms !== null && ms <= 0) {
      const winner = color === 'white' ? 'black' : 'white';
      const playerResult = winner === this.playerColor ? 'win' : 'loss';
      this._status = 'finished';
      return { termination: 'timeout', result: playerResult };
    }
    return null;
  }

  /** Mark the game as unranked (called when the coach intervenes). */
  setUnranked() { this.ranked = false; }

  /** Reset the clock baseline to now so alert display time is not debited. */
  resetClockBaseline() { this._lastMoveAt = this.clock.now(); }

  resign() {
    if (this.isOver) throw new GameAlreadyOverError(`Game '${this.id}' is already over`);
    this._status = 'finished';
    return { result: 'loss', termination: 'resignation' };
  }

  /**
   * Assert hint is allowed (casual games only).
   * @throws HintNotAllowedError if the game is ranked
   */
  assertHintAllowed() {
    if (this.ranked) throw new HintNotAllowedError(`Hints are not allowed in ranked game '${this.id}'`);
  }

  /** Restore session from persisted moves (resume after disconnect). */
  static fromMoves(opts, savedMoves) {
    if (opts.status === 'finished' || opts.status === 'abandoned') {
      throw new GameNotResumableError(`Game '${opts.gameId}' cannot be resumed (${opts.status})`);
    }
    const session = new GameSession(opts);
    for (const m of savedMoves) {
      const from = m.uci.slice(0, 2);
      const to = m.uci.slice(2, 4);
      const promotion = m.uci[4] || undefined;
      session._chess.move({ from, to, promotion });
      session._moves.push(m);
    }
    // Restore saved clock values so the server debits from the correct baseline,
    // not from the initial time as set by the constructor.
    if (opts.savedClockWhiteMs != null) session._clockWhiteMs = opts.savedClockWhiteMs;
    if (opts.savedClockBlackMs != null) session._clockBlackMs = opts.savedClockBlackMs;
    return session;
  }

  _checkGameOver() {
    const chess = this._chess;
    if (!chess.isGameOver()) return null;

    let termination;
    let result; // from player's perspective
    const playerIsWhite = this.playerColor === 'white';

    if (chess.isCheckmate()) {
      termination = 'checkmate';
      // the side that just moved won
      const whiteJustMoved = chess.turn() === 'b';
      const playerWon = playerIsWhite ? whiteJustMoved : !whiteJustMoved;
      result = playerWon ? 'win' : 'loss';
    } else {
      for (const [method, term] of Object.entries(TERMINATION_MAP)) {
        if (method !== 'isCheckmate' && chess[method]?.()) {
          termination = term;
          break;
        }
      }
      result = 'draw';
    }

    this._status = 'finished';
    return { result, termination };
  }
}
