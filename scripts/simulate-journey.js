#!/usr/bin/env node
/**
 * @module scripts/simulate-journey
 * CLI runner for the repertoire journey simulation.
 *
 * Writes a populated SQLite database that Playwright can point at for
 * visual testing (DOM assertions + screenshots).
 *
 * Usage:
 *   node scripts/simulate-journey.js --out /tmp/journey.db
 *
 * Then:
 *   DATA_DIR=/tmp/journey.db npm start
 *   # navigate to localhost:3000 and walk through the repertoire pages
 *
 * Or for Playwright:
 *   DATA_DIR=/tmp/journey.db npx playwright test -c playwright.journey.config.js
 *
 * IMPORTANT: never targets data/chess.db.
 */

import { parseArgs } from 'node:util';
import { existsSync, unlinkSync } from 'node:fs';

import {
  createJourneyHarness,
  snapshotBook,
  checkAllInvariants,
  V1_JOURNEY,
} from '../tests/support/journey/index.js';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: '/tmp/journey.db' },
    verbose: { type: 'boolean', default: false },
  },
  strict: true,
});

const OUT_PATH = args.out;

if (OUT_PATH.includes('chess.db')) {
  console.error('ERROR: refusing to write to chess.db — preregistration window must be preserved');
  process.exit(1);
}

// Remove existing output file so we start fresh
if (existsSync(OUT_PATH)) {
  unlinkSync(OUT_PATH);
  if (args.verbose) console.log(`Removed existing ${OUT_PATH}`);
}

// ─── Run journey ─────────────────────────────────────────────────────────────

console.log(`simulate-journey: writing to ${OUT_PATH}`);

const harness = createJourneyHarness({ dbPath: OUT_PATH });

let stagesFailed = 0;
let stagesXfail = 0;
let stagesPassed = 0;

for (const stage of V1_JOURNEY) {
  process.stdout.write(`  ${stage.name} ... `);
  try {
    await stage.fn(harness);
    if (stage.expectFail) {
      console.log('XPASS (defect may be fixed!)');
    } else {
      console.log('PASS');
      stagesPassed++;
    }
  } catch (err) {
    if (stage.expectFail) {
      console.log(`xfail [${(stage.failDefects ?? []).join(', ')}]`);
      if (args.verbose) console.log(`    ${err.message.slice(0, 120)}`);
      stagesXfail++;
    } else {
      console.log(`FAIL: ${err.message.slice(0, 100)}`);
      stagesFailed++;
    }
  }
}

// ─── Final invariants ────────────────────────────────────────────────────────

const violations = checkAllInvariants(harness);
if (violations.length) {
  console.error('\nInvariant violations:');
  violations.forEach(v => console.error(`  - ${v}`));
  stagesFailed += violations.length;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

const snap = snapshotBook(harness);
console.log(`
Journey complete:
  Stages passed:   ${stagesPassed}
  Stages xfail:    ${stagesXfail}  (open defects — expected)
  Stages failed:   ${stagesFailed}  (unexpected — please investigate)

Book state at end of simulation:
  Total nodes:     ${snap.totalNodes}
  Confirmed:       ${snap.confirmedNodes}
  Candidates:      ${snap.candidateNodes}
  Book version:    ${snap.bookVersion}
  Changelog:       ${snap.changelogEntries} entries

Output:  ${OUT_PATH}
`);

if (stagesFailed > 0) {
  process.exit(1);
}
