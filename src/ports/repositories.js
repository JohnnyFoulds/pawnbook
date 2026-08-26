/**
 * @module ports/repositories
 * Repository port contracts.
 * Two implementations per repo: SqliteRepository (production) and InMemoryRepository (tests).
 */

/**
 * @interface GameRepository
 */

/**
 * @function
 * @name GameRepository#save
 * @param {Object} game
 * @returns {string} id
 */

/**
 * @function
 * @name GameRepository#findById
 * @param {string} id
 * @returns {Object}
 * @throws {GameNotFoundError}
 */

/**
 * @function
 * @name GameRepository#update
 * @param {string} id
 * @param {Object} patch
 * @returns {void}
 */

/**
 * @function
 * @name GameRepository#appendMove
 * @param {string} gameId
 * @param {Object} move - { ply, uci, san, msTaken }
 * @returns {void}
 */

/**
 * @function
 * @name GameRepository#getMovesForGame
 * @param {string} gameId
 * @returns {Object[]}
 */

/**
 * @function
 * @name GameRepository#list
 * @param {Object} [opts]
 * @returns {Object[]}
 */

// ────────────────────────────────────────────────────────────────

/**
 * @interface PuzzleRepository
 */

/**
 * @function
 * @name PuzzleRepository#upsert
 * @param {Object} puzzle
 * @returns {string} id
 */

/**
 * @function
 * @name PuzzleRepository#findById
 * @param {string} id
 * @returns {Object}
 * @throws {PuzzleNotFoundError}
 */

/**
 * @function
 * @name PuzzleRepository#getDueCards
 * @param {Date} now
 * @returns {Object[]}
 */

/**
 * @function
 * @name PuzzleRepository#saveCard
 * @param {string} puzzleId
 * @param {Object} card
 * @returns {void}
 */

/**
 * @function
 * @name PuzzleRepository#saveReview
 * @param {Object} review
 * @returns {void}
 */

// ────────────────────────────────────────────────────────────────

/**
 * @interface SettingsRepository
 */

/**
 * @function
 * @name SettingsRepository#get
 * @param {string} key
 * @returns {string|null}
 */

/**
 * @function
 * @name SettingsRepository#set
 * @param {string} key
 * @param {string} value
 * @returns {void}
 */

/**
 * @function
 * @name SettingsRepository#updateElo
 * @param {number} newElo
 * @param {string} gameId
 * @returns {void} writes elo_history + settings in one transaction
 */

/**
 * @function
 * @name SettingsRepository#getEloHistory
 * @returns {Object[]}
 */
