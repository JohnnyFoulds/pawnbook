/**
 * @module api/error-middleware
 * Single express error handler: maps domain errors → standard HTTP response.
 */

import { ZodError } from 'zod';

import {
  GameNotFoundError, GameAlreadyOverError, GameNotResumableError,
  IllegalMoveError, PuzzleNotFoundError, EngineUnavailableError,
  EngineTimeoutError, WeightsMissingError, AnalysisFailedError,
  HintNotAllowedError, ErrorCode, errorCodeFor,
} from '../errors.js';
import { logger } from '../config.js';

const log = logger.child({ mod: 'error-middleware' });

const STATUS_MAP = new Map([
  [GameNotFoundError, 404],
  [PuzzleNotFoundError, 404],
  [GameAlreadyOverError, 409],
  [GameNotResumableError, 409],
  [IllegalMoveError, 422],
  [HintNotAllowedError, 403],
  [WeightsMissingError, 503],
  [EngineUnavailableError, 503],
  [EngineTimeoutError, 503],
  [AnalysisFailedError, 500],
]);

/** @param {Error} err @returns {number} */
function statusFor(err) {
  for (const [cls, status] of STATUS_MAP) {
    if (err instanceof cls) return status;
  }
  return 500;
}

 
// Express requires a 4-arg signature for error handlers; `_next` is intentionally unused
export function errorMiddleware(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error_code: ErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      detail: err.flatten(),
    });
  }

  const status = statusFor(err);
  const error_code = errorCodeFor(err);

  if (status >= 500) {
    log.error({ err }, 'unhandled error');
  } else {
    log.warn({ err, error_code }, 'request error');
  }

  res.status(status).json({
    error_code,
    message: err.message,
    detail: {},
  });
}
