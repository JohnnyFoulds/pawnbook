/**
 * @module ports/ids
 * ID-generator port — abstracts randomUUID() so exports and event logs are
 * deterministic in tests (invariant 13: two exports at the same book_version
 * are byte-identical).
 *
 * Two implementations:
 *   UuidIds       — calls crypto.randomUUID() (production)
 *   SequentialIds — returns id-1, id-2, … (tests / journey harness)
 */

/**
 * @interface IdGenerator
 */

/**
 * @function
 * @name IdGenerator#next
 * @returns {string}
 */
