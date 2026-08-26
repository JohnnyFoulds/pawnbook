/**
 * @module config
 * Environment parsing, pino configuration, and runtime constants.
 * Fails loudly on missing required env so misconfiguration is caught at startup.
 */

import pino from 'pino';

import * as balance from './shared/balance.js';

/** @param {string} name @returns {string} */
function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Required environment variable missing: ${name}`);
  return val;
}

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const BIND_ADDR = process.env.BIND_ADDR || '127.0.0.1';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const ENGINE_MODE = process.env.ENGINE_MODE || 'native';

// Optional OTel endpoint — absence is fine (traces go to console when OTEL_TRACE_CONSOLE=1)
export const OTEL_EXPORTER_OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || null;
export const OTEL_TRACE_CONSOLE = process.env.OTEL_TRACE_CONSOLE === '1';

// Engine binary paths — resolved by ENGINE_MODE
const NATIVE_PATHS = {
  stockfish: '/opt/homebrew/opt/stockfish/bin/stockfish',
  lc0: '/opt/homebrew/Cellar/lc0/0.32.1/libexec/lc0',
  drawfish: null, // x86-64 ELF, not runnable natively
};
const CONTAINER_PATHS = {
  stockfish: '/usr/local/bin/stockfish',
  lc0: '/usr/local/bin/lc0',
  drawfish: '/usr/local/bin/drawfish',
};

export const ENGINE_PATHS = ENGINE_MODE === 'native' ? NATIVE_PATHS : CONTAINER_PATHS;

export const WEIGHTS_DIR = process.env.WEIGHTS_DIR
  || (ENGINE_MODE === 'container' ? '/app/weights' : new URL('../weights', import.meta.url).pathname);

export const DATA_DIR = process.env.DATA_DIR
  || (ENGINE_MODE === 'container' ? '/app/data' : new URL('../data', import.meta.url).pathname);

export const DB_PATH = `${DATA_DIR}/chess.db`;

// Re-export balance constants so consumers only need one import
export { balance };

/** Root pino logger. Use logger.child({ mod: 'module-name' }) per module. */
export const logger = pino({
  level: process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug'),
  ...(NODE_ENV !== 'production' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});
