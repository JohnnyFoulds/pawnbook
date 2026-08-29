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

// ────────────────────────────────────────────────────────────────

/**
 * @interface RepertoireRepository
 */

/**
 * @function
 * @name RepertoireRepository#getOrCreateProvenance
 * @param {{ schemaVersion: string, balanceHash: string, appGitSha?: string, sfVersion?: string, sfDepth?: number, sfMultipv?: number, maiaWeightsId?: string }} ctx
 * @returns {number} provenance row id
 */

/**
 * @function
 * @name RepertoireRepository#getCurrentBookVersion
 * @returns {number}
 */

/**
 * @function
 * @name RepertoireRepository#incrementBookVersion
 * @returns {number} new version
 */

/**
 * @function
 * @name RepertoireRepository#appendObservation
 * @param {Object} obs
 * @returns {void}
 */

/**
 * @function
 * @name RepertoireRepository#getObservationsForNode
 * @param {string} epd
 * @param {string} side
 * @returns {Object[]}
 */

/**
 * @function
 * @name RepertoireRepository#appendDeviation
 * @param {Object} dev
 * @returns {void}
 */

/**
 * @function
 * @name RepertoireRepository#getDeviationsForGame
 * @param {string} gameId
 * @returns {Object[]}
 */

/**
 * @function
 * @name RepertoireRepository#appendAudit
 * @param {Object} audit
 * @returns {void}
 */

/**
 * @function
 * @name RepertoireRepository#getAudit
 * @param {string} id
 * @returns {Object|null}
 */

/**
 * @function
 * @name RepertoireRepository#openChallenge
 * @param {Object} challenge
 * @returns {void}
 */

/**
 * @function
 * @name RepertoireRepository#updateChallenge
 * @param {string} id
 * @param {Object} patch
 * @returns {void}
 */

/**
 * @function
 * @name RepertoireRepository#getChallenge
 * @param {string} id
 * @returns {Object|null}
 */

/**
 * @function
 * @name RepertoireRepository#getOpenChallenge
 * @param {string} epd
 * @param {string} side
 * @returns {Object|null}
 */

/**
 * @function
 * @name RepertoireRepository#appendChangelog
 * @param {Object} entry
 * @returns {void}
 */

/**
 * @function
 * @name RepertoireRepository#getChangelog
 * @param {number} [limit]
 * @returns {Object[]}
 */

/**
 * @function
 * @name RepertoireRepository#upsertSuppression
 * @param {Object} supp
 * @returns {void}
 */

/**
 * @function
 * @name RepertoireRepository#getSuppression
 * @param {string} epd
 * @param {string} side
 * @param {string} moveUci
 * @returns {Object|null}
 */

/**
 * @function
 * @name RepertoireRepository#upsertNode
 * @param {Object} node
 * @returns {void}
 */

/**
 * @function
 * @name RepertoireRepository#getNode
 * @param {string} epd
 * @param {string} side
 * @returns {Object|null}
 */

/**
 * @function
 * @name RepertoireRepository#listNodes
 * @returns {Object[]}
 */

/**
 * @function
 * @name RepertoireRepository#upsertMove
 * @param {Object} move
 * @returns {void}
 */

/**
 * @function
 * @name RepertoireRepository#getMove
 * @param {string} epd
 * @param {string} side
 * @param {string} moveUci
 * @returns {Object|null}
 */

/**
 * @function
 * @name RepertoireRepository#getMovesForNode
 * @param {string} epd
 * @param {string} side
 * @returns {Object[]}
 */

/**
 * @function
 * @name RepertoireRepository#upsertPolicy
 * @param {Object} policy
 * @returns {void}
 */

/**
 * @function
 * @name RepertoireRepository#getPolicy
 * @param {string} epd
 * @param {string} maiaModel
 * @param {string} maiaWeightsId
 * @returns {Object|null}
 */

/**
 * @function
 * @name RepertoireRepository#transaction
 * @param {Function} fn
 * @returns {any}
 */
