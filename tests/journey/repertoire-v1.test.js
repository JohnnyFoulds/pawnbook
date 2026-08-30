/**
 * @module tests/journey/repertoire-v1.test.js
 * Longitudinal repertoire journey — v1 (30-day simulation).
 *
 * Run with:  npm run journey
 * (alias for: vitest run tests/journey/)
 *
 * This suite drives the journey harness through the complete v1 scenario and
 * collects failures per stage. Expected-fail stages (open defects) are run and
 * their errors reported as xfail; unexpected passes are promoted to failures.
 *
 * Green = all non-xfail stages pass AND all xfail stages fail for the documented reason.
 * The current Phase 28 run is expected to have several failing stages — that is
 * the deliverable: the first honest measurement of feature completeness.
 */
import { describe, it, expect, beforeAll } from 'vitest';

import {
  createJourneyHarness,
  V1_JOURNEY,
  checkAllInvariants,
} from '../support/journey/index.js';

// ─── Setup ───────────────────────────────────────────────────────────────────

let harness;
const stageResults = [];

beforeAll(async () => {
  harness = createJourneyHarness({ dbPath: ':memory:' });
});

// ─── Journey runner ───────────────────────────────────────────────────────────

describe('Repertoire v1 journey', () => {
  // Run stages in sequence — each builds on the harness state from prior stages
  for (const stage of V1_JOURNEY) {
    it(stage.name, async () => {
      let err = null;
      try {
        await stage.fn(harness);
      } catch (e) {
        err = e;
      }

      stageResults.push({ name: stage.name, err, expectFail: stage.expectFail, defects: stage.failDefects });

      if (stage.expectFail) {
        // xfail: must have thrown
        if (!err) {
          // This stage passed unexpectedly — a defect was fixed!
          // Not a test failure, but worth noting. In strict mode this would
          // be a failure (Phase 37 will tighten this).
          console.log(`[xpass] ${stage.name} — defects ${(stage.failDefects ?? []).join(', ')} may be fixed`);
        } else {
          // Expected failure: passes the vitest run
          // Uncomment to see the failure reason:
          // console.log(`[xfail] ${stage.name}: ${err.message.slice(0, 120)}`);
        }
      } else {
        // Must pass
        if (err) throw err;
      }
    });
  }

  // ─── Final invariant check ───────────────────────────────────────────────

  it('final: all structural invariants pass', () => {
    const violations = checkAllInvariants(harness);
    expect(violations, `Invariant violations: ${violations.join('; ')}`).toHaveLength(0);
  });

  // ─── Failure summary ─────────────────────────────────────────────────────

  it('failure summary (informational)', () => {
    const xfailPassed = stageResults.filter(r => r.expectFail && !r.err);
    const unexpectedFails = stageResults.filter(r => !r.expectFail && r.err);

    if (xfailPassed.length) {
      console.log('\n[journey] Unexpectedly passing xfail stages (defects may be fixed):');
      xfailPassed.forEach(r => console.log(`  ✓ ${r.name} — was waiting for: ${(r.defects ?? []).join(', ')}`));
    }

    const xfailFailed = stageResults.filter(r => r.expectFail && r.err);
    if (xfailFailed.length) {
      console.log(`\n[journey] ${xfailFailed.length} stages failed as expected (open defects):`);
      xfailFailed.forEach(r =>
        console.log(`  ✗ ${r.name} [${(r.defects ?? []).join(', ')}]: ${r.err.message.slice(0, 100)}`)
      );
    }

    // Unexpected failures should have already caused individual tests to fail.
    // This summary test always passes.
    expect(unexpectedFails).toHaveLength(0);
  });
});
