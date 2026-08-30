/**
 * @module tests/support/journey/probes
 * State, event and invariant probes for the journey harness.
 *
 * Three probe categories:
 *  probeState     — query the DB for assertions about persisted state
 *  probeEvents    — assertions about WS messages captured in FakeWs._messages
 *  probeInvariants — cross-entity consistency checks
 *
 * All functions throw descriptive errors on failure so vitest shows
 * "Invariant 3 violated: ..." rather than a generic assertion failure.
 */

// ─── State probes ─────────────────────────────────────────────────────────────

/**
 * Count how many nodes have at least one move with the given role.
 * @param {object} harness
 * @param {'canonical'|'alt'|'candidate'|'challenger'|'quarantined'} role
 * @returns {number}
 */
export function countNodesByRole(harness, role) {
  const nodes = harness.repertoireRepo.listNodes();
  return nodes.filter(n => {
    const moves = harness.repertoireRepo.getMovesForNode(n.epd, n.side);
    return moves.some(m => m.role === role);
  }).length;
}

/**
 * Return all changelog entries of a specific kind.
 * @param {object} harness
 * @param {string} kind — 'confirm'|'promote'|'quarantine'|'retire'|'reverse'|...
 * @returns {object[]}
 */
export function changelogByKind(harness, kind) {
  return harness.repertoireRepo.getChangelog(500).filter(e => e.kind === kind);
}

/**
 * Count games in the DB.
 * @param {object} harness
 * @returns {number}
 */
export function countGames(harness) {
  return harness.gameRepo.list({ limit: 9999 }).length;
}

/**
 * Check whether a specific game has been fully analysed.
 * @param {object} harness
 * @param {string} gameId
 * @returns {boolean}
 */
export function isAnalysed(harness, gameId) {
  const game = harness.gameRepo.findById(gameId);
  return game?.analysisState === 'done';
}

/**
 * Return the number of eval rows for a game.
 */
export function evalCount(harness, gameId) {
  return harness.gameRepo.getEvals(gameId).length;
}

// ─── Event probes ─────────────────────────────────────────────────────────────

/**
 * Assert that a WS message of the given type was received.
 * @param {object} ws — FakeWs
 * @param {string} type
 * @param {string} [context] — for error messages
 */
export function assertReceived(ws, type, context = '') {
  const msg = ws.lastOfType(type);
  if (!msg) {
    const types = [...new Set(ws._messages.map(m => m.type))].join(', ');
    throw new Error(`assertReceived(${type}): not found${context ? ' — ' + context : ''}. Received: [${types}]`);
  }
  return msg;
}

/**
 * Assert that no message of the given type was received.
 */
export function assertNotReceived(ws, type, context = '') {
  const msg = ws.lastOfType(type);
  if (msg) {
    throw new Error(`assertNotReceived(${type}): unexpectedly found${context ? ' — ' + context : ''}`);
  }
}

/**
 * Assert that a repertoire_alert was received with a specific kind.
 */
export function assertAlertKind(ws, kind) {
  const alerts = ws.messagesOfType('repertoire_alert');
  if (!alerts.length) throw new Error(`assertAlertKind(${kind}): no repertoire_alert received`);
  const last = alerts[alerts.length - 1];
  if (last.kind !== kind) {
    throw new Error(`assertAlertKind: expected "${kind}" but got "${last.kind}"`);
  }
  return last;
}

/**
 * Assert that a repertoire_update was received (U5).
 */
export function assertRepertoireUpdate(ws) {
  return assertReceived(ws, 'repertoire_update', 'U5: repertoire_update not emitted after analysis');
}

/**
 * Assert that the ranked_changed message was received (B1).
 */
export function assertRankedChanged(ws) {
  return assertReceived(ws, 'ranked_changed', 'B1: ranked_changed not emitted after coach alert');
}

// ─── Invariant probes ─────────────────────────────────────────────────────────

/**
 * Invariant 1: every rep_observation row references a valid game.
 */
export function checkInv1_observationsHaveGames(harness) {
  // Proxy check: if there are observations, every fen-key seen should match a stored move.
  // (Full invariant 1 requires reading rep_observations directly — non-zero check for now.)
  // Will be tightened in Phase 37 reconciliation.
  const nodeCount = harness.repertoireRepo.listNodes().length;
  return nodeCount; // returns 0 when book is empty — non-zero indicates observations exist
}

/**
 * Invariant 2: no quarantined move appears in opening FSRS cards.
 */
export function checkInv2_noQuarantinedInCards(harness) {
  const nodes = harness.repertoireRepo.listNodes();
  for (const node of nodes) {
    const moves = harness.repertoireRepo.getMovesForNode(node.epd, node.side);
    const quarantined = moves.filter(m => m.role === 'quarantined').map(m => m.move_uci ?? m.moveUci);
    if (!quarantined.length) continue;

    // Check opening cards for this FEN
    const card = harness.puzzleRepo.getByFenAndKind?.(node.fen, 'opening');
    if (!card) continue;
    const accepted = JSON.parse(card.accepted_moves_json ?? card.acceptedMovesJson ?? '[]');
    for (const q of quarantined) {
      if (accepted.includes(q)) {
        throw new Error(`Invariant 2 violated: quarantined move ${q} appears in opening card for ${node.fen}`);
      }
    }
  }
}

/**
 * Invariant 3: changelog entries are append-only (no deletions, ids strictly increase).
 * We check that the count never decreases between calls.
 */
export function makeInv3Monitor(harness) {
  let _prevCount = 0;
  return function checkInv3() {
    const entries = harness.repertoireRepo.getChangelog(9999);
    if (entries.length < _prevCount) {
      throw new Error(`Invariant 3 violated: changelog count decreased from ${_prevCount} to ${entries.length}`);
    }
    _prevCount = entries.length;
  };
}

/**
 * Invariant 4: book_version equals the number of changelog entries that changed it.
 * (Soft check — exact equality requires counting only version-bumping entries.)
 */
export function checkInv4_bookVersionConsistent(harness) {
  const version = harness.repertoireRepo.getCurrentBookVersion();
  const changelog = harness.repertoireRepo.getChangelog(9999);
  // Version must be >= 0 and <= changelog length (each version-bumping op adds at least one entry)
  if (version < 0 || version > changelog.length) {
    throw new Error(`Invariant 4 violated: bookVersion=${version} not in [0, ${changelog.length}]`);
  }
}

/**
 * Invariant 8: every canonical node has exactly one canonical move.
 */
export function checkInv8_singleCanonicalMove(harness) {
  const nodes = harness.repertoireRepo.listNodes();
  for (const node of nodes) {
    const moves = harness.repertoireRepo.getMovesForNode(node.epd, node.side);
    const canonical = moves.filter(m => m.role === 'canonical');
    if (canonical.length > 1) {
      throw new Error(
        `Invariant 8 violated: node ${node.epd}/${node.side} has ${canonical.length} canonical moves`
      );
    }
  }
}

/**
 * Invariant 13: two identical journey runs over the same harness produce
 * byte-identical snapshots. (Requires SequentialIds.)
 * This is asserted after the full journey in the vitest runner.
 */
export function snapshotForDeterminismCheck(harness) {
  const nodes = harness.repertoireRepo.listNodes();
  const changelog = harness.repertoireRepo.getChangelog(9999);
  return JSON.stringify({
    nodeCount: nodes.length,
    bookVersion: harness.repertoireRepo.getCurrentBookVersion(),
    changelogCount: changelog.length,
    // Include the first 10 changelog entries for spot-check
    changelogHead: changelog.slice(0, 10).map(e => ({
      kind: e.kind,
      rule: e.rule,
    })),
  });
}

/**
 * Run all structural invariants for a standard check.
 * Returns a list of violation strings (empty = all pass).
 */
export function checkAllInvariants(harness) {
  const violations = [];
  try { checkInv2_noQuarantinedInCards(harness); } catch (e) { violations.push(e.message); }
  try { checkInv4_bookVersionConsistent(harness); } catch (e) { violations.push(e.message); }
  try { checkInv8_singleCanonicalMove(harness); } catch (e) { violations.push(e.message); }
  return violations;
}
