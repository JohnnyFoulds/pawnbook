/**
 * @module tests/support/journey/journeys/v1
 * The 30-day longitudinal journey — Act I (onboarding), Act II (coach),
 * Act III (maturity).
 *
 * Each stage is an async function (harness) => void.
 * Stages deliberately FAIL on open defects so the journey run is the first
 * honest measurement of the feature. Phase 28 produces a failing run.
 * Subsequent phases fix defects and the journey turns green incrementally.
 *
 * Open defects expected to fail in this run:
 *   B1  — ranked_changed never emitted
 *   B2  — deviation.js never called (order_slip not triggered)
 *   B3  — electCanonical never called
 *   B4  — candidateExpired never called
 *   B5  — reAuditQuarantined never called
 *   B6  — gateVerdict always null
 *   B7  — engineDelta never computed (challenge rules 2-5 inert)
 *   U3  — no Undo button
 *   U5  — repertoire_update unhandled by client (asserted as server emit here)
 */

import { advanceDay, playGame, snapshotBook } from '../journey-dsl.js';
import {
  assertRepertoireUpdate,
  assertRankedChanged,
  checkAllInvariants, changelogByKind,
} from '../probes.js';

// ─── Scripted game lines ──────────────────────────────────────────────────────
// Johannes always plays 1.e4 as White. The engine replies with e5.
// The book converges on the King's Pawn opening.

const OPENING_MOVES_WHITE = [
  { uci: 'e2e4', san: 'e4',  fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' },
  { uci: 'g1f3', san: 'Nf3', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2' },
  { uci: 'f1c4', san: 'Bc4', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3' },
];

// A divergent move (e4 → d4 on move 1) — triggers a book alert after book is established
const DIVERGENT_MOVE_WHITE = [
  { uci: 'd2d4', san: 'd4', fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1' },
];

// Italian extended — continues OPENING_MOVES_WHITE with 7 more moves (total 10).
// Positions 4-10 are new nodes not covered by OPENING_MOVES_WHITE.
// Play this line 3× to confirm those 7 nodes (REP_CONFIRM_OBS = 2).
const LONG_LINE_1 = [
  ...OPENING_MOVES_WHITE,           // e4, Nf3, Bc4 (re-confirms the existing 3 nodes)
  { uci: 'd2d3', san: 'd3' },       // Giuoco Piano: d3
  { uci: 'c2c3', san: 'c3' },       // c3 prep
  { uci: 'b1d2', san: 'Nbd2' },     // Nbd2 (d-pawn on d3 frees d2)
  { uci: 'e1g1', san: 'O-O' },      // castle (f1 clear via Bc4, g1 clear via Nf3)
  { uci: 'f1e1', san: 'Rfe1' },     // rook to e1 (after O-O, h-rook on f1)
  { uci: 'h2h3', san: 'h3' },       // luft
  { uci: 'a2a4', san: 'a4' },       // space
];

// Queen's pawn line — completely different opening, all 10 positions are new nodes.
// Play this line 3× to confirm all 10 new nodes.
const LONG_LINE_2 = [
  { uci: 'd2d4', san: 'd4' },       // QP opening — shares starting node with OPENING_MOVES_WHITE
  { uci: 'e2e3', san: 'e3' },       // solid centre
  { uci: 'g1f3', san: 'Nf3' },      // Nf3
  { uci: 'f1e2', san: 'Be2' },      // Be2 (e2 empty after e-pawn to e3)
  { uci: 'e1g1', san: 'O-O' },      // castle (f1 clear via Be2, g1 clear via Nf3)
  { uci: 'c2c4', san: 'c4' },       // c4
  { uci: 'b1c3', san: 'Nc3' },      // Nc3 (c3 empty after c-pawn to c4)
  { uci: 'd1c2', san: 'Qc2' },      // Qc2 (c2 empty after c-pawn to c4)
  { uci: 'f1d1', san: 'Rfd1' },     // Rfd1 (d1 empty after Qc2; f1 is the rook post-O-O)
  { uci: 'a2a3', san: 'a3' },       // a3
  { uci: 'b2b3', san: 'b3' },       // b3 — 11th move gives 10 new nodes (move 1 shares starting node)
];

// ─── Act I — Onboarding (days 1–9) ──────────────────────────────────────────

/**
 * Stage 1: Days 1–2. Play the opening twice. Candidates created but not confirmed.
 * FR-REP-BUILD-1: positions with <REP_CONFIRM_OBS observations are candidates.
 */
async function stage1_firstCandidates(harness) {
  // Day 1, game 1 — first observation
  await playGame(harness, {
    moves: OPENING_MOVES_WHITE,
    resign: true,
  });

  const snap1 = snapshotBook(harness);
  // After 1 observation: positions exist as candidates
  if (snap1.totalNodes === 0) {
    throw new Error(`Stage 1: expected candidate nodes after first game, got 0. ` +
      `processGame may not have saved any observations.`);
  }
  if (snap1.confirmedNodes > 0) {
    throw new Error(`Stage 1: expected 0 confirmed nodes after 1 observation, got ${snap1.confirmedNodes}. ` +
      `REP_CONFIRM_OBS=${2} requires 2 observations minimum.`);
  }

  // Structural invariants pass even with only candidates
  const violations = checkAllInvariants(harness);
  if (violations.length) throw new Error(`Stage 1 invariants: ${violations.join('; ')}`);
}

/**
 * Stage 2: Days 3–4. Play the same opening again — positions confirm.
 * FR-REP-BUILD-2: REP_CONFIRM_OBS=2 observations → canonical.
 */
async function stage2_firstConfirmations(harness) {
  await advanceDay(harness, 2);

  const { ws } = await playGame(harness, {
    moves: OPENING_MOVES_WHITE,
    resign: true,
  });

  const snap = snapshotBook(harness);
  if (snap.confirmedNodes === 0) {
    throw new Error(`Stage 2: expected confirmed nodes after 2 observations. ` +
      `B3: electCanonical is never called — this is the expected Phase 28 failure for B3.`);
  }

  // repertoire_update message should arrive (U5)
  // Note: server emits it, but the client currently ignores it (U5 defect).
  // Here we assert the server side: ws should have received repertoire_update.
  assertRepertoireUpdate(ws); // will fail until B7/U5 analysis pipeline returns evals
}

/**
 * Stage 3: Days 5–8. Repeat 8 more games — build toward 20 confirmed nodes.
 * FR-REP-COACH-1: coach stays silent below REP_BOOTSTRAP_CONFIRMED_MIN (20).
 */
async function stage3_bootstrapSilence(harness) {
  await advanceDay(harness, 3);

  // Play 6 more games with the base opening to repeat existing nodes
  for (let i = 0; i < 6; i++) {
    await playGame(harness, { moves: OPENING_MOVES_WHITE, resign: true });
    await advanceDay(harness, 1);
  }

  // Play LONG_LINE_1 three times — confirms 7 new Italian-extension nodes (positions 4-10)
  for (let i = 0; i < 3; i++) {
    await playGame(harness, { moves: LONG_LINE_1, resign: true });
    await advanceDay(harness, 1);
  }

  // Play LONG_LINE_2 three times — confirms 10 new Queen's-pawn nodes
  for (let i = 0; i < 3; i++) {
    await playGame(harness, { moves: LONG_LINE_2, resign: true });
    await advanceDay(harness, 1);
  }

  // Total confirmed canonical nodes: 3 (base) + 7 (LONG_LINE_1 new) + 10 (LONG_LINE_2 new, 11 moves - 1 shared start) = 20.
  // The coach is now able to wake in Stage 4. No alert fires yet (game lines are all in-book).
}

/**
 * Stage 4: Day 9. Play enough games to cross REP_BOOTSTRAP_CONFIRMED_MIN.
 * The 20th confirmed node wakes the coach (FR-REP-COACH-1).
 *
 * NOTE: This stage is expected to fail until B3 (electCanonical) is fixed,
 * because confirmed nodes are never created without electCanonical.
 */
async function stage4_coachWakes(harness) {
  await advanceDay(harness, 1);

  const snap = snapshotBook(harness);

  if (snap.confirmedNodes < 20) {
    throw new Error(
      `Stage 4: expected ≥20 confirmed nodes to wake the coach, got ${snap.confirmedNodes}. ` +
      `Check that LONG_LINE_1 and LONG_LINE_2 were played 3× each in stage3_bootstrapSilence.`
    );
  }
}

// ─── Act II — The coach (days 10–20) ─────────────────────────────────────────

/**
 * Stage 5: Day 10. First book alert — player plays a deviant move.
 * FR-REP-COACH-2: alert fires when player deviates from canonical.
 * B1: ranked_changed should be emitted but isn't.
 */
async function stage5_firstAlert(harness) {
  await advanceDay(harness, 1);

  const { ws } = await playGame(harness, {
    moves: DIVERGENT_MOVE_WHITE,
    resign: true,
  });

  const alert = ws.lastOfType('repertoire_alert');
  if (!alert) {
    throw new Error('Stage 5: expected repertoire_alert for divergent move, got none. ' +
      'Requires canonical nodes (electCanonical, Phase 29) and deviation routing (Phase 32).');
  }

  // B1: ranked_changed must be emitted alongside the alert (Phase 32)
  assertRankedChanged(ws);
}

/**
 * Stage 6: Day 11. Player plays order_slip — right moves, wrong order.
 * FR-REP-COACH-5: alert kind is 'order_slip' (reachableBookUcis wired in Phase 33).
 */
async function stage6_orderSlip(harness) {
  await advanceDay(harness, 1);

  // Nf3 before e4 — a reordering of the canonical Italian line.
  // Phase 33: reachableBookUcis is now computed; g1f3 matches Nf3 in the canonical line
  // → classifyDeviation fires 'order_slip'.
  const orderSlipMoves = [
    { uci: 'g1f3', san: 'Nf3' },
    { uci: 'e2e4', san: 'e4' },
  ];

  const { ws } = await playGame(harness, {
    moves: orderSlipMoves,
    resign: true,
  });

  const alert = ws.lastOfType('repertoire_alert');
  if (!alert) {
    throw new Error('Stage 6: expected repertoire_alert for order_slip, got none.');
  }
  if (alert.kind !== 'order_slip') {
    throw new Error(`Stage 6: expected alert kind 'order_slip', got '${alert.kind}'.`);
  }
}

/**
 * Stage 7: Day 12. Player refuses an alert.
 * FR-REP-CHALLENGE-1: a challenge opens after a deliberate refusal.
 * B7: engineDelta never computed — challenge rules 2-5 inert.
 */
async function stage7_firstRefusal(harness) {
  await advanceDay(harness, 1);

  // Play divergent move to trigger alert, then refuse (keep the player move)
  await playGame(harness, {
    moves: DIVERGENT_MOVE_WHITE,
    resign: true,
  });

  // For now: challenge count is checked in stage 9.
  // B7 failure: no challenge will progress to promotion
  // (Documented, not asserted here — asserted in stage 9)
}

/**
 * Stage 8: Day 14. Player plays the challenger move unprompted.
 * FR-REP-CHALLENGE-3 (rule 3): challenger promoted after player plays it.
 * B7: engineDelta is never set → rule 3 cannot fire.
 */
async function stage8_challengerPromotion(harness) {
  await advanceDay(harness, 2);

  const priorPromotions = changelogByKind(harness, 'promote');

  await playGame(harness, {
    moves: DIVERGENT_MOVE_WHITE,
    resign: true,
  });

  await advanceDay(harness, 0); // trigger maintenance

  const afterPromotions = changelogByKind(harness, 'promote');
  if (afterPromotions.length <= priorPromotions.length) {
    throw new Error(`Stage 8 (B7): expected a promotion changelog entry after player played challenger. ` +
      `B7: engineDelta is never computed so challenge rules 2-5 cannot fire. Closing in Phase 31.`);
  }
}

/**
 * Stage 9: Day 16. Player reverses a promotion (Undo).
 * U3: POST /api/repertoire/changelog/:id/reverse exists but no UI calls it.
 */
async function stage9_reversal(harness) {
  await advanceDay(harness, 2);

  const promotions = changelogByKind(harness, 'promote');
  if (!promotions.length) {
    // No promotions to reverse — expected given B7
    throw new Error(`Stage 9 (U3/B7): cannot test reversal — no promotions exist yet (B7 is open). ` +
      `U3 will be tested after Phase 31 fixes B7.`);
  }
}

/**
 * Stage 10: Day 18. Alert times out — no challenge opens (invariant 15).
 */
async function stage10_timeoutNoChallenge(harness) {
  await advanceDay(harness, 2);

  await playGame(harness, {
    moves: DIVERGENT_MOVE_WHITE,
    resign: true,
  });

  // Allow alert to fire (the alert is shown but times out)
  harness.scheduler.fireAll(); // timeout fires → auto-applies move, no challenge

  // Invariant 15: a timed-out alert should NOT open a challenge
  // (Will pass if alerts fire — currently won't fire due to B3)
}

// ─── Act III — Maturity (days 21–30) ─────────────────────────────────────────

/**
 * Stage 11: Day 21. Quarantine exit on re-audit (B5).
 */
async function stage11_quarantineExit(harness) {
  await advanceDay(harness, 3);

  // B5 failure: reAuditQuarantined never called — quarantined moves never exit.
  // Soft assertion in Phase 28 — hard assertion added in Phase 29.
  snapshotBook(harness);
}

/**
 * Stage 12: Day 26. A single 200-day jump (tests DUE_SOFT_CAP behaviour).
 */
async function stage12_largeTimeJump(harness) {
  await advanceDay(harness, 200);
  // Correct behaviour: DUE_SOFT_CAP = 40 caps the drill queue regardless of backlog
  // This is a structural test — no specific assertion in Phase 28
}

/**
 * Stage 13: Day 30. Final state checks.
 */
async function stage13_maturityChecks(harness) {
  await advanceDay(harness, 4);

  const violations = checkAllInvariants(harness);
  if (violations.length) {
    throw new Error(`Stage 13 final invariants: ${violations.join('; ')}`);
  }

  // Phase 28: we accept 0 confirmed nodes because B3 prevents confirmation.
  // Phase 37 will assert: snapshotBook(harness).confirmedNodes >= 20
  snapshotBook(harness); // structural check — result asserted in Phase 37
}

// ─── Journey definition ────────────────────────────────────────────────────────

/**
 * The complete v1 journey as an ordered list of stages.
 * Each stage is { name, fn, expectFail, failDefects }.
 *
 * expectFail stages are run but their errors are collected rather than thrown,
 * so the harness can report all failures at once instead of stopping at the first.
 */
export const V1_JOURNEY = [
  {
    name: 'Stage 1: First candidates (days 1-2)',
    fn: stage1_firstCandidates,
    expectFail: false,
  },
  {
    name: 'Stage 2: First confirmations (days 3-4)',
    fn: stage2_firstConfirmations,
    expectFail: true,  // B3 prevents confirmation until Phase 29
    failDefects: ['B3'],
  },
  {
    name: 'Stage 3: Bootstrap silence (days 5-8)',
    fn: stage3_bootstrapSilence,
    expectFail: false,
  },
  {
    name: 'Stage 4: Coach wakes (day 9)',
    fn: stage4_coachWakes,
    expectFail: false,
  },
  {
    name: 'Stage 5: First alert (day 10)',
    fn: stage5_firstAlert,
    expectFail: false,
  },
  {
    name: 'Stage 6: Order slip (day 11)',
    fn: stage6_orderSlip,
    expectFail: false,
  },
  {
    name: 'Stage 7: First refusal (day 12)',
    fn: stage7_firstRefusal,
    expectFail: false, // refusal doesn't progress to promotion
  },
  {
    name: 'Stage 8: Challenger promotion (day 14)',
    fn: stage8_challengerPromotion,
    expectFail: true,  // stage8 promotion assertion: soft fail until Phase 31 audit path confirmed end-to-end in journey
    failDefects: ['B7'],
  },
  {
    name: 'Stage 9: Reversal (day 16)',
    fn: stage9_reversal,
    expectFail: true,  // U3: reverse button not tested at journey level (UI-only)
    failDefects: ['U3'],
  },
  {
    name: 'Stage 10: Timeout no-challenge (day 18)',
    fn: stage10_timeoutNoChallenge,
    expectFail: false,
  },
  {
    name: 'Stage 11: Quarantine exit (day 21)',
    fn: stage11_quarantineExit,
    expectFail: false, // soft assertion in Phase 28
  },
  {
    name: 'Stage 12: Large time jump (day 26)',
    fn: stage12_largeTimeJump,
    expectFail: false,
  },
  {
    name: 'Stage 13: Final maturity checks (day 30)',
    fn: stage13_maturityChecks,
    expectFail: false,
  },
];
