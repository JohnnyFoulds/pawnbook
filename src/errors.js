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
export class RepertoireNodeNotFoundError extends PawnbookError {}   // 404
export class ChallengeNotOpenError extends PawnbookError {}          // 409
export class NoPendingMoveError extends PawnbookError {}             // 409
export class RepertoireMoveRefusedError extends PawnbookError {}     // 422
export class InvalidRepertoireDecisionError extends PawnbookError {} // 400

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
  REPERTOIRE_NODE_NOT_FOUND: 'repertoire_node_not_found',
  CHALLENGE_NOT_OPEN: 'challenge_not_open',
  NO_PENDING_MOVE: 'no_pending_move',
  REPERTOIRE_MOVE_REFUSED: 'repertoire_move_refused',
  INVALID_REPERTOIRE_DECISION: 'invalid_repertoire_decision',
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
  [RepertoireNodeNotFoundError, ErrorCode.REPERTOIRE_NODE_NOT_FOUND],
  [ChallengeNotOpenError, ErrorCode.CHALLENGE_NOT_OPEN],
  [NoPendingMoveError, ErrorCode.NO_PENDING_MOVE],
  [RepertoireMoveRefusedError, ErrorCode.REPERTOIRE_MOVE_REFUSED],
  [InvalidRepertoireDecisionError, ErrorCode.INVALID_REPERTOIRE_DECISION],
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
