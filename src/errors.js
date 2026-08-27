/**
 * @module errors
 * Domain error taxonomy for pawnbook.
 * All errors extend PawnbookError; transport concerns stay in the API layer.
 */

export class PawnbookError extends Error {
  /**
   * @param {string} message
   * @param {ErrorOptions} [options]
   */
  constructor(message, options) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class GameNotFoundError extends PawnbookError {}
export class GameAlreadyOverError extends PawnbookError {}
export class GameNotResumableError extends PawnbookError {}
export class IllegalMoveError extends PawnbookError {}
export class PuzzleNotFoundError extends PawnbookError {}
export class EngineUnavailableError extends PawnbookError {}
export class EngineTimeoutError extends PawnbookError {}
export class WeightsMissingError extends PawnbookError {}
export class AnalysisFailedError extends PawnbookError {}
export class HintNotAllowedError extends PawnbookError {}

/** Frozen enum of all error codes. Never use string literals outside this object. */
export const ErrorCode = Object.freeze({
  GAME_NOT_FOUND: 'game_not_found',
  GAME_ALREADY_OVER: 'game_already_over',
  GAME_NOT_RESUMABLE: 'game_not_resumable',
  ILLEGAL_MOVE: 'illegal_move',
  PUZZLE_NOT_FOUND: 'puzzle_not_found',
  ENGINE_UNAVAILABLE: 'engine_unavailable',
  ENGINE_TIMEOUT: 'engine_timeout',
  WEIGHTS_MISSING: 'weights_missing',
  ANALYSIS_FAILED: 'analysis_failed',
  HINT_NOT_ALLOWED: 'hint_not_allowed',
  // VALIDATION_FAILED is emitted directly by the API layer (ws/handlers.js, error-middleware.js)
  // on Zod parse failure — it is never returned by errorCodeFor() for domain errors.
  VALIDATION_FAILED: 'validation_failed',
  RATE_LIMITED: 'rate_limited',
});

/** @type {Map<Function, string>} */
const errorCodeMap = new Map([
  [GameNotFoundError, ErrorCode.GAME_NOT_FOUND],
  [GameAlreadyOverError, ErrorCode.GAME_ALREADY_OVER],
  [GameNotResumableError, ErrorCode.GAME_NOT_RESUMABLE],
  [IllegalMoveError, ErrorCode.ILLEGAL_MOVE],
  [PuzzleNotFoundError, ErrorCode.PUZZLE_NOT_FOUND],
  [EngineUnavailableError, ErrorCode.ENGINE_UNAVAILABLE],
  [EngineTimeoutError, ErrorCode.ENGINE_TIMEOUT],
  [WeightsMissingError, ErrorCode.WEIGHTS_MISSING],
  [AnalysisFailedError, ErrorCode.ANALYSIS_FAILED],
  [HintNotAllowedError, ErrorCode.HINT_NOT_ALLOWED],
]);

/**
 * Return the ErrorCode string for a given error instance.
 * @param {Error} err
 * @returns {string}
 */
export function errorCodeFor(err) {
  for (const [cls, code] of errorCodeMap) {
    if (err instanceof cls) return code;
  }
  return 'internal_error';
}
