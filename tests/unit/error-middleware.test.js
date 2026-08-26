import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { errorMiddleware } from '../../src/api/error-middleware.js';
import {
  GameNotFoundError, GameAlreadyOverError, HintNotAllowedError,
  EngineUnavailableError, EngineTimeoutError, WeightsMissingError,
  IllegalMoveError, GameNotResumableError,
} from '../../src/errors.js';

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    status(s) { this._status = s; return this; },
    json(b) { this._body = b; return this; },
  };
  return res;
}

const REQ = {};
const NEXT = () => {};

describe('errorMiddleware', () => {
  it('maps ZodError to 400 with validation_failed', () => {
    // Create a real ZodError
    const schema = z.object({ x: z.string() });
    let zodErr;
    try { schema.parse({ x: 42 }); } catch (e) { zodErr = e; }

    const res = makeRes();
    errorMiddleware(zodErr, REQ, res, NEXT);
    expect(res._status).toBe(400);
    expect(res._body.error_code).toBe('validation_failed');
  });

  it('maps GameNotFoundError to 404', () => {
    const res = makeRes();
    errorMiddleware(new GameNotFoundError('Game not found'), REQ, res, NEXT);
    expect(res._status).toBe(404);
    expect(res._body.error_code).toBe('game_not_found');
  });

  it('maps GameAlreadyOverError to 409', () => {
    const res = makeRes();
    errorMiddleware(new GameAlreadyOverError('already over'), REQ, res, NEXT);
    expect(res._status).toBe(409);
  });

  it('maps GameNotResumableError to 409', () => {
    const res = makeRes();
    errorMiddleware(new GameNotResumableError('not resumable'), REQ, res, NEXT);
    expect(res._status).toBe(409);
  });

  it('maps HintNotAllowedError to 403', () => {
    const res = makeRes();
    errorMiddleware(new HintNotAllowedError('no hint'), REQ, res, NEXT);
    expect(res._status).toBe(403);
    expect(res._body.error_code).toBe('hint_not_allowed');
  });

  it('maps EngineUnavailableError to 503', () => {
    const res = makeRes();
    errorMiddleware(new EngineUnavailableError('engine down'), REQ, res, NEXT);
    expect(res._status).toBe(503);
  });

  it('maps EngineTimeoutError to 503', () => {
    const res = makeRes();
    errorMiddleware(new EngineTimeoutError('timeout'), REQ, res, NEXT);
    expect(res._status).toBe(503);
  });

  it('maps WeightsMissingError to 503', () => {
    const res = makeRes();
    errorMiddleware(new WeightsMissingError('weights missing'), REQ, res, NEXT);
    expect(res._status).toBe(503);
  });

  it('maps IllegalMoveError to 422', () => {
    const res = makeRes();
    errorMiddleware(new IllegalMoveError('illegal'), REQ, res, NEXT);
    expect(res._status).toBe(422);
  });

  it('maps an unhandled error to 500', () => {
    const res = makeRes();
    errorMiddleware(new Error('unexpected'), REQ, res, NEXT);
    expect(res._status).toBe(500);
  });

  it('response body always has error_code and message', () => {
    const res = makeRes();
    errorMiddleware(new GameNotFoundError('Game xyz not found'), REQ, res, NEXT);
    expect(res._body).toHaveProperty('error_code');
    expect(res._body).toHaveProperty('message');
    expect(res._body).toHaveProperty('detail');
  });
});
