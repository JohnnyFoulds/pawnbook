/**
 * @module tui/client
 * WebSocket + REST client for the TUI.
 * Reconnects with exponential backoff capped at 30 s.
 * Emits events via a simple EventEmitter-style API.
 *
 * The TUI is a pure WS/REST client — it holds no game state,
 * computes no move correctness, and makes no scheduling decisions.
 * Everything it receives from the server is rendered directly.
 */

import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

/** Reconnect backoff config (ms). */
const BACKOFF = { initial: 1000, max: 30000, factor: 2 };

/**
 * @typedef {Object} ClientOptions
 * @property {string} [host]    — e.g. 'localhost:3000'
 * @property {Function} [onMessage]
 * @property {Function} [onOpen]
 * @property {Function} [onClose]
 * @property {Function} [onError]
 */

/**
 * Create a managed WebSocket client with reconnect.
 * @param {ClientOptions} opts
 * @returns {{ send: Function, close: Function, reconnectDelay: Function }}
 */
export function createClient(opts = {}) {
  const {
    host = 'localhost:3000',
    onMessage = () => {},
    onOpen = () => {},
    onClose = () => {},
    onError = () => {},
  } = opts;

  let ws = null;
  let delay = BACKOFF.initial;
  let closed = false;

  function connect() {
    if (closed) return;
    const url = `ws://${host}/ws`;
    try {
      // Dynamic require for ws — keeps the module optional dep
      const WebSocket = _require('ws');
      ws = new WebSocket(url);

      ws.on('open', () => {
        delay = BACKOFF.initial;
        onOpen();
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          onMessage(msg);
        } catch (e) {
          onError(e);
        }
      });

      ws.on('close', () => {
        onClose();
        if (!closed) scheduleReconnect();
      });

      ws.on('error', (err) => {
        onError(err);
      });
    } catch (err) {
      onError(err);
      if (!closed) scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    setTimeout(connect, delay);
    delay = Math.min(delay * BACKOFF.factor, BACKOFF.max);
  }

  connect();

  return {
    /** Send a message object as JSON. */
    send(msg) {
      if (ws && ws.readyState === 1 /* OPEN */) {
        ws.send(JSON.stringify(msg));
      }
    },

    /** Close permanently (no reconnect). */
    close() {
      closed = true;
      if (ws) ws.close();
    },

    /** Return current reconnect delay (for tests). */
    reconnectDelay() { return delay; },
  };
}

/**
 * Make a REST API call.
 * @param {string} host
 * @param {string} path
 * @param {{ method?: string, body?: object }} [opts]
 * @returns {Promise<any>}
 */
export async function apiCall(host, path, opts = {}) {
  const { method = 'GET', body } = opts;
  const url = `http://${host}${path}`;
  const fetchOpts = {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  };
  const r = await fetch(url, fetchOpts);
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`${method} ${path} → ${r.status}: ${text}`);
  }
  return r.json();
}
