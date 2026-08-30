/**
 * @module tests/support/journey
 * Public API for the longitudinal journey harness.
 *
 * Usage:
 *   import { createJourneyHarness, playGame, advanceDay, probes } from '../../support/journey/index.js';
 */

export { createJourneyHarness, advanceDays } from './harness.js';
export { playGame, acceptAlert, refuseAlert, advanceDay, snapshotBook } from './journey-dsl.js';
export { BANDS, makeEval, makeGameEvals, cpToWinPct, winLossFromCp } from './eval-model.js';
export {
  countNodesByRole,
  changelogByKind,
  countGames,
  isAnalysed,
  evalCount,
  assertReceived,
  assertNotReceived,
  assertAlertKind,
  assertRepertoireUpdate,
  assertRankedChanged,
  checkAllInvariants,
  checkInv2_noQuarantinedInCards,
  checkInv4_bookVersionConsistent,
  checkInv8_singleCanonicalMove,
  makeInv3Monitor,
  snapshotForDeterminismCheck,
} from './probes.js';
export { V1_JOURNEY } from './journeys/v1.js';
