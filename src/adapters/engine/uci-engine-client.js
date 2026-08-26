/**
 * @module adapters/engine/uci-engine-client
 * Real UCI engine client over child_process stdin/stdout.
 */

import { spawn } from 'child_process';
import { EngineUnavailableError, EngineTimeoutError, WeightsMissingError } from '../../errors.js';
import { logger } from '../../config.js';

const log = logger.child({ mod: 'uci-engine-client' });

const HANDSHAKE_TIMEOUT_MS = 10_000;

/**
 * @param {string} binaryPath
 * @param {string[]} [args]
 * @returns {Promise<UciEngineClient>}
 */
export async function createUciEngineClient(binaryPath, args = []) {
  const client = new UciEngineClient(binaryPath, args);
  await client._handshake();
  return client;
}

export class UciEngineClient {
  /**
   * @param {string} binaryPath
   * @param {string[]} args
   */
  constructor(binaryPath, args = []) {
    this._binaryPath = binaryPath;
    this._args = args;
    this._proc = null;
    this._lineBuffer = '';
    this._listeners = [];
  }

  async _handshake() {
    let proc;
    try {
      proc = spawn(this._binaryPath, this._args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      throw new EngineUnavailableError(
        `Engine '${this._binaryPath}' could not be spawned`,
        { cause: err }
      );
    }

    proc.on('error', (err) => {
      if (!this._proc) {
        // Error during startup handled below
      } else {
        log.error({ err }, 'engine process error');
      }
    });

    proc.stdout.on('data', (chunk) => {
      this._lineBuffer += chunk.toString();
      const lines = this._lineBuffer.split('\n');
      this._lineBuffer = lines.pop();
      for (const line of lines) {
        const l = line.trim();
        if (l) this._emit(l);
      }
    });

    this._proc = proc;

    await this._waitForLine('readyok', () => {
      this._write('uci\n');
    }, HANDSHAKE_TIMEOUT_MS);

    log.debug({ binary: this._binaryPath }, 'engine ready');
  }

  /**
   * @param {string} fen
   * @param {object} opts
   * @param {number} [opts.depth]
   * @param {number} [opts.movetime]
   * @param {number} [opts.multiPV]
   * @returns {Promise<{cp: number|null, mate: number|null, bestmove: string, pv: string, lines: object[]}>}
   */
  async eval(fen, opts = {}) {
    const { depth = 18, movetime, multiPV = 1 } = opts;
    this._write(`setoption name MultiPV value ${multiPV}\n`);
    this._write(`position fen ${fen}\n`);

    const lines = [];
    const infoHandler = (line) => {
      if (line.startsWith('info ')) lines.push(parseInfoLine(line));
    };
    this._listeners.push(infoHandler);

    const bestmoveLine = await this._waitForLine('bestmove', () => {
      if (movetime) {
        this._write(`go movetime ${movetime}\n`);
      } else {
        this._write(`go depth ${depth}\n`);
      }
    });

    this._listeners = this._listeners.filter(l => l !== infoHandler);

    const bestmove = bestmoveLine.split(' ')[1];
    const deepest = lines.filter(l => l.depth).sort((a, b) => b.depth - a.depth);
    const top = deepest[0] ?? {};

    return {
      cp: top.cp ?? null,
      mate: top.mate ?? null,
      bestmove,
      pv: top.pv ?? '',
      lines: deepest,
    };
  }

  /**
   * Get move policy distribution from lc0 (classic mode with VerboseMoveStats).
   * @param {string} fen
   * @param {number} [nodes=2]
   * @returns {Promise<Map<string, number>>} move → probability (0–1)
   */
  async policy(fen, nodes = 2) {
    this._write(`position fen ${fen}\n`);

    const policyLines = [];
    const infoHandler = (line) => {
      if (line.startsWith('info string ')) policyLines.push(line);
    };
    this._listeners.push(infoHandler);

    await this._waitForLine('bestmove', () => {
      this._write(`go nodes ${nodes}\n`);
    });

    this._listeners = this._listeners.filter(l => l !== infoHandler);
    return parsePolicyLines(policyLines);
  }

  /**
   * @param {string} fen
   * @returns {Promise<string>} bestmove UCI
   */
  async bestmove(fen) {
    const result = await this.eval(fen, { depth: 1 });
    return result.bestmove;
  }

  dispose() {
    if (this._proc) {
      try { this._write('quit\n'); } catch { /* ignore */ }
      this._proc.kill();
      this._proc = null;
    }
  }

  _write(text) {
    if (!this._proc) throw new EngineUnavailableError('Engine process is not running');
    this._proc.stdin.write(text);
  }

  _emit(line) {
    for (const handler of this._listeners) handler(line);
  }

  /**
   * Send setup, then wait for a line matching `token` or throw on timeout.
   * @param {string} token
   * @param {Function} setup
   * @param {number} [timeoutMs]
   * @returns {Promise<string>}
   */
  _waitForLine(token, setup, timeoutMs = 60_000) {
    return new Promise((resolve, reject) => {
      let timer;

      const handler = (line) => {
        if (line.includes(token)) {
          clearTimeout(timer);
          this._listeners = this._listeners.filter(l => l !== handler);
          // Flush isready after uci handshake
          if (token === 'readyok') {
            resolve(line);
          } else {
            resolve(line);
          }
        }
      };

      timer = setTimeout(() => {
        this._listeners = this._listeners.filter(l => l !== handler);
        reject(new EngineTimeoutError(
          `Engine '${this._binaryPath}' timed out waiting for '${token}'`
        ));
      }, timeoutMs);

      this._listeners.push(handler);

      // For the handshake: send 'uci' first, then 'isready' on 'uciok'
      if (token === 'readyok') {
        const uciOkHandler = (line) => {
          if (line.includes('uciok')) {
            this._listeners = this._listeners.filter(l => l !== uciOkHandler);
            this._write('isready\n');
          }
        };
        this._listeners.push(uciOkHandler);
        setup();
      } else {
        setup();
      }
    });
  }
}

// ─── parsers ─────────────────────────────────────────────────────────────────

/** @param {string} line */
function parseInfoLine(line) {
  const result = {};
  const parts = line.split(' ');
  for (let i = 0; i < parts.length; i++) {
    switch (parts[i]) {
      case 'depth': result.depth = Number(parts[++i]); break;
      case 'seldepth': result.seldepth = Number(parts[++i]); break;
      case 'nodes': result.nodes = Number(parts[++i]); break;
      case 'multipv': result.multipv = Number(parts[++i]); break;
      case 'score': {
        const type = parts[++i];
        const val = Number(parts[++i]);
        if (type === 'cp') result.cp = val;
        else if (type === 'mate') result.mate = val;
        break;
      }
      case 'pv': result.pv = parts.slice(i + 1).join(' '); i = parts.length; break;
      case 'bestmove': result.bestmove = parts[++i]; break;
    }
  }
  return result;
}

/**
 * Parse lc0 VerboseMoveStats policy lines.
 * Format: info string e2e4  (322 ) N:      32 ... (P: 50.22%) ...
 * @param {string[]} lines
 * @returns {Map<string, number>}
 */
export function parsePolicyLines(lines) {
  const map = new Map();
  const re = /^info string (\S+)\s+\(\s*\d+\s*\).*\(P:\s*([\d.]+)%\)/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const move = m[1];
    if (move === 'node') continue; // skip root summary
    const prob = parseFloat(m[2]) / 100;
    map.set(move, prob);
  }
  return map;
}

/**
 * Validate that a weights file path refers to an existing file.
 * @param {string} weightsPath
 */
export function assertWeightsExist(weightsPath) {
  import('fs').then(fs => {
    if (!fs.existsSync(weightsPath)) {
      throw new WeightsMissingError(`Weights file '${weightsPath}' not found`);
    }
  });
}
