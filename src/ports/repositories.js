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

/**
 * @function
 * @name GameRepository#saveStrengthSample
 * @param {{gameId: string, side: string, n: number, ase: number, sd: number, p75Loss: number|null, wasTimed: boolean, coeffVersion: number}} sample
 * @returns {void}
 */

/**
 * @function
 * @name GameRepository#listStrengthSamples
 * @param {{side?: string, limit?: number}} [opts]
 * @returns {object[]} newest game first
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

/**
 * @function
 * @name PuzzleRepository#getByFenAndKind
 * @param {string} fen
 * @param {string} kind
 * @returns {Object|null}
 */

/**
 * @function
 * @name PuzzleRepository#updateFindability
 * @param {string} id
 * @param {{ findability: number, temptation: number, instructiveness: number, maiaModel: string, policyTemperature: number }} fields
 * @returns {void}
 */

/**
 * @function
 * @name PuzzleRepository#getMotifDrillAccuracy
 * @returns {Array<{motifTag: string, total: number, correct: number}>}
 */

/**
 * @function
 * @name PuzzleRepository#getDrillAccuracyHistory
 * @param {number} [limitDays=30]
 * @returns {Array<{day: string, attempted: number, correct: number}>} sorted ascending
 */

/**
 * @function
 * @name PuzzleRepository#getTodayDrillStats
 * @param {number} nowMs - current timestamp in milliseconds
 * @returns {{attempted: number, correct: number}}
 */

// ────────────────────────────────────────────────────────────────

/**
 * @function
 * @name GameRepository#getActivityHistory
 * @param {number} [limitDays=30]
 * @returns {Array<{day: string, games: number, reviews: number}>}
 */

/**
 * @function
 * @name GameRepository#getBestStreak
 * @returns {number} length of the longest consecutive daily activity run ever recorded
 */

/**
 * @function
 * @name GameRepository#getWinRateHistory
 * @param {number} [limitDays=90]
 * @returns {Array<{day: string, played: number, won: number, lost: number, drawn: number}>} sorted ascending
 */

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
 * @name RepertoireRepository#listOpenChallenges
 * @returns {Object[]}
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
 * @name RepertoireRepository#getChangelogEntry
 * @param {string} id
 * @returns {Object|null}
 */

/**
 * @function
 * @name RepertoireRepository#getAllDeviations
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
