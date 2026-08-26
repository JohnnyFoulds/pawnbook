/**
 * @module ports/engine-client
 * EngineClient port — contract for UCI engine interaction.
 * Two implementations: UciEngineClient (production) and ScriptedEngineClient (tests).
 */

/**
 * @typedef {Object} EvalResult
 * @property {number} depth
 * @property {number|null} cp - centipawns, normalised to White's POV
 * @property {number|null} mate - mate in N (negative = mated in N)
 * @property {string} bestmove - UCI move string
 * @property {string[]} pv - principal variation
 */

/**
 * @typedef {Object} PolicyResult
 * @property {Record<string, number>} policy - move (UCI) → probability (0–1)
 * @property {string} bestmove
 */

/**
 * @interface EngineClient
 * Implementations must provide the methods below. The port is injected at the
 * composition root; domain code never constructs an engine directly.
 */

/**
 * @function
 * @name EngineClient#eval
 * @param {string} fen
 * @param {Object} opts
 * @param {number} [opts.depth]
 * @param {number} [opts.movetime]
 * @param {number} [opts.multiPV]
 * @returns {Promise<EvalResult[]>} one result per MultiPV line
 */

/**
 * @function
 * @name EngineClient#policy
 * @param {string} fen
 * @param {string} weightsPath
 * @param {number} [policyTemperature=1.0]
 * @returns {Promise<PolicyResult>}
 */

/**
 * @function
 * @name EngineClient#bestmove
 * @param {string} fen
 * @param {Object} opts
 * @param {number} [opts.movetime]
 * @param {string} [opts.weightsPath] - for Maia policyhead play
 * @returns {Promise<string>} UCI move string
 */

/**
 * @function
 * @name EngineClient#dispose
 * @returns {Promise<void>}
 */
