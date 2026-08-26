import { describe, it, expect } from 'vitest';

import {
  PawnbookError,
  GameNotFoundError,
  GameAlreadyOverError,
  GameNotResumableError,
  IllegalMoveError,
  PuzzleNotFoundError,
  EngineUnavailableError,
  EngineTimeoutError,
  WeightsMissingError,
  AnalysisFailedError,
  HintNotAllowedError,
  ErrorCode,
  errorCodeFor,
} from '../../src/errors.js';

describe('errors', () => {
  it('every error class extends PawnbookError', () => {
    const classes = [
      GameNotFoundError, GameAlreadyOverError, GameNotResumableError,
      IllegalMoveError, PuzzleNotFoundError, EngineUnavailableError,
      EngineTimeoutError, WeightsMissingError, AnalysisFailedError,
      HintNotAllowedError,
    ];
    for (const Cls of classes) {
      expect(new Cls('test')).toBeInstanceOf(PawnbookError);
    }
  });

  it('ErrorCode is frozen and every class maps to exactly one code', () => {
    expect(Object.isFrozen(ErrorCode)).toBe(true);

    const instances = [
      [new GameNotFoundError('x'), ErrorCode.GAME_NOT_FOUND],
      [new GameAlreadyOverError('x'), ErrorCode.GAME_ALREADY_OVER],
      [new GameNotResumableError('x'), ErrorCode.GAME_NOT_RESUMABLE],
      [new IllegalMoveError('x'), ErrorCode.ILLEGAL_MOVE],
      [new PuzzleNotFoundError('x'), ErrorCode.PUZZLE_NOT_FOUND],
      [new EngineUnavailableError('x'), ErrorCode.ENGINE_UNAVAILABLE],
      [new EngineTimeoutError('x'), ErrorCode.ENGINE_TIMEOUT],
      [new WeightsMissingError('x'), ErrorCode.WEIGHTS_MISSING],
      [new AnalysisFailedError('x'), ErrorCode.ANALYSIS_FAILED],
      [new HintNotAllowedError('x'), ErrorCode.HINT_NOT_ALLOWED],
    ];

    for (const [err, expected] of instances) {
      expect(errorCodeFor(err)).toBe(expected);
    }
  });

  it('wrapping preserves cause chain', () => {
    const original = new Error('original');
    const wrapped = new EngineUnavailableError('wrapped', { cause: original });
    expect(wrapped.cause).toBe(original);
    expect(wrapped.message).toBe('wrapped');
  });

  it('error name matches class name', () => {
    const err = new GameNotFoundError("Game '42' not found");
    expect(err.name).toBe('GameNotFoundError');
  });
});
