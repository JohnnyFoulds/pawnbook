# Longitudinal test plan — auto-repertoire journey harness

**Status:** Phase 28 — 2026-08-30  
**Authority:** Non-normative. Describes the architecture and decisions for `tests/support/journey/`
and `scripts/simulate-journey.js`. Fails here are first diagnosed against this document before
touching `feature_spec.md`.

---

## 1. Purpose and motivation

Phase 26 passed its review on the wrong evidence: unit tests verified pure-domain functions in
isolation. The seams between service and domain were never exercised. The result was 15 behavioural
defects that could not be caught by unit tests alone (see `defect_register.md`).

The journey harness drives the real WebSocket handler over a real SQLite database with a simulated
clock and a deterministic fake engine. It is the only instrument that can catch seam-level defects
like B7 (`_gatherEvidence` never computes `engine_delta_win_pts`).

**The Phase 28 deliverable is a failing run.** Every open defect in the register causes a specific
assertion to fail. Green = all defects fixed. That transition is the story of Phases 29–36.

---

## 2. Module structure

```
tests/support/journey/
├── index.js           Public API (re-exports from the modules below)
├── harness.js         openDb + createApp + fake WS + write-counting repo proxy
├── eval-model.js      Programmatic cp-by-ply → move_evals rows; band validation
├── journey-dsl.js     playGame / advanceDay / assertState / assertEvent helpers
├── probes.js          State probes, event probes, invariant probes
└── journeys/
    └── v1.js          The 30-day journey as data (stages as described in user_journey.md)

scripts/
└── simulate-journey.js  CLI: writes a throwaway SQLite DB for Playwright to read
```

---

## 3. The two-DB rule

**Always SQLite. Never InMemoryRepository.**

The journey harness MUST use `openDb(':memory:')` (vitest) or `openDb(tmpfile)` (Playwright). It
MUST NEVER use `InMemoryGameRepository`, `InMemoryPuzzleRepository`, etc.

Rationale: B15 revealed that the in-memory repositories return camelCase from `getEvals`, while the
SQLite repositories return snake_case. `build.js` reads `eval_.win_loss_pts`. Against the in-memory
repo, every gate returns `admitted` regardless of the actual move quality — the journey would
appear green while the app remained broken. That is precisely the failure mode of the Phase 26 review.

`data/chess.db` is the research database. It MUST be opened, written, or pointed at by nothing in the
harness. Every run asserts `data/chess.db` mtime is unchanged before and after. This is a hard gate.

---

## 4. The four injected dependencies

The journey harness instantiates the application via `createApp()` (`src/app.js`) with four injected
non-production adapters:

| Dependency | Production adapter | Journey adapter | Why |
|---|---|---|---|
| `clock` | `SystemClock` | `FixedClock` | Advance time without wall-clock waits |
| `scheduler` | `RealTimer` | `ManualTimer` | Fire alert timeouts synchronously |
| `enginePool` | `createEnginePool()` | `createFakeEnginePool()` | No engine binary needed |
| `ids` | `UuidIds` | `SequentialIds` | Byte-identical exports (invariant 13) |

`FixedClock` and `ManualTimer` are already unit-tested in `tests/unit/adapters/phase-27-adapters.test.js`.

---

## 5. harness.js design

```js
// Pseudocode — actual implementation in tests/support/journey/harness.js
export async function createJourneyHarness(opts = {}) {
  const db = openDb(opts.dbPath ?? ':memory:');
  const clock = new FixedClock(opts.startMs ?? Date.parse('2025-01-01T00:00:00Z'));
  const scheduler = new ManualTimer();
  const ids = new SequentialIds('jrn', 1);
  const enginePool = createFakeEnginePool({ cp: 30 });

  // Wrap repos in a write-counting proxy
  const { app, repos } = createApp({ db, clock, scheduler, enginePool, ids });
  const writeProxy = createWriteProxy(repos);

  return { app, clock, scheduler, ids, db, repos: writeProxy };
}
```

### Write-counting proxy

The proxy wraps every repository. It intercepts all mutating methods (`save`, `appendMove`,
`saveMoveEval`, `upsertNode`, `upsertMove`, `appendObservation`, `appendChangelog`, etc.) and logs
each write with: method name, caller stack frame, timestamp.

**Fail condition:** If a mutating method is called from *outside* the application handler (i.e.
directly from the journey script for test setup), the proxy throws `WriteProxyViolation` and fails
the run. Test setup MUST go through the handler.

**Rationale:** Without this guard, the harness can silently bootstrap state that the application
would never produce. A journey stage then "passes" while the feature is still broken. The write proxy
makes that invisible drift immediately visible.

**Exception:** The proxy allows one explicit bypass for `openDb` schema bootstrap
(`initSchema(db)` called before the proxy is installed). This is not application behaviour; it is a
one-time SQLite schema creation.

---

## 6. The day-advance model

```
advanceDay(gapDays = 1):
  1. clock.advance(gapDays * 24 * 60 * 60 * 1000)
  2. scheduler.fireAll()    // fire any pending alert timeouts
  3. await runBookMaintenance(app)  // electCanonical, candidateExpired, reAuditQuarantined
  4. snapshot.push(captureState(repos))
```

`runBookMaintenance` is implemented in `src/api/ws/maintenance-service.js` (Phase 29). In Phase 28 the
call is a stub that logs a warning and returns — maintenance passes silently, and the harness stages
that depend on maintenance (3.1 candidate expiry, 3.2 quarantine exit) **fail loudly** as expected.

Snapshots are lightweight: they capture counts of each `rep_moves` role, `rep_changelog` entries,
`rep_challenges` statuses, and `rep_policy` rows. The growth curve plotted by Phase 36's journey view
is derived from the same series.

---

## 7. The fake WS object

The harness never starts an HTTP server. Instead, `createApp` returns a `handleMessage(ws, raw)`
function. The harness passes a fake `ws` object that records every sent message:

```js
function makeFakeWs() {
  const sent = [];
  return {
    readyState: 1,
    OPEN: 1,
    send(data) { sent.push(JSON.parse(data)); },
    emit(event, ...args) { /* no-op or captured */ },
    once(event, fn) { /* no-op */ },
    _sent: sent,
  };
}
```

The `_sent` array is the event probe target. All WS assertions read from it.

---

## 8. Assertion taxonomy

### 8.1 State probes

Query the SQLite database directly after a stage completes. Examples:

```js
// Count canonical moves
db.prepare('SELECT count(*) as n FROM rep_moves WHERE role = ?').get('canonical').n

// Check challenge status
db.prepare('SELECT status FROM rep_challenges WHERE id = ?').get(challengeId)

// Invariant 6: no single-observation canonical
db.prepare('SELECT count(*) as n FROM rep_moves WHERE observations = 1 AND role = "canonical"').get().n === 0
```

State probes are the most reliable assertion type: they check the actual durable state, not
ephemeral events.

### 8.2 Event probes

Read `ws._sent` after a stage. Examples:

```js
// Check ranked_changed was emitted (B1)
ws._sent.find(m => m.type === 'ranked_changed' && m.reason === 'repertoire_coach')

// Check repertoire_update was sent (U5)
ws._sent.find(m => m.type === 'repertoire_update')

// Check alert kind (B2)
ws._sent.find(m => m.type === 'repertoire_alert' && m.kind === 'order_slip')
```

Event probes are more fragile than state probes (they depend on message ordering) but are the only
way to verify ephemeral WS events that leave no DB trace.

### 8.3 Invariant probes

Cross-entity consistency checks run after each `advanceDay`. All 16 invariants from `feature_spec.md
§NFR-INV` are checked. The most critical:

| Invariant | Check |
|---|---|
| 1 | One canonical per (epd, side) |
| 6 | No `observations = 1` canonical |
| 13 | Two runs on same DB produce byte-identical exports |
| 14 | Promoted challenger has `challenger_plays ≥ REP_CONFIRM_OBS` |
| 15 | `alerted_timeout` never creates a `rep_challenges` row |
| 16 (Phase 29) | Maintenance is idempotent — running twice yields no second changelog entry |

---

## 9. playGame DSL

```js
// Send all moves for one game through the real handler
async function playGame(ws, handler, { moves, engineMoves = [], evalModel }) {
  // 1. Send new_game
  // 2. For each player move: send 'move', await response
  //    - If coach alert fires: send 'repertoire_choice' per the fixture's decision
  //    - If scheduler.fireAll() is called: timeout fires
  // 3. Inject move_evals for analysis (via eval model, not real engine)
  // 4. Wait for 'analysis_done'
}
```

The `evalModel` parameter is an instance of the programmatic eval model from `eval-model.js`. It
produces move_eval rows from CP bands rather than from engine output.

---

## 10. Scope boundaries — what the harness does NOT cover

| Out of scope | Reason | Where tested |
|---|---|---|
| Real engine depth or bestmove | Would require Stockfish binary; any version change would break fixtures | E2E Playwright suite (`playwright.config.js`) |
| Browser rendering or CSS | Requires a real DOM | Playwright journey screenshots (`playwright.journey.config.js`, Phase 35) |
| Network latency | Harness is in-process | Load testing (if needed, separate tool) |
| Multi-user concurrency | Single connection per harness instance | Not tested |
| SQLite WAL/concurrent write safety | Not relevant for single-user app | Integration test if needed |
| Migration correctness | Tested by `tests/unit/migration-puzzles.test.js` | Already covered |

---

## 11. Failure triage

When a journey stage fails, the triage order is:

1. **Journey bug:** The stage assertion is wrong. The spec says something different from the journey
   description. Check `feature_spec.md`. If the journey contradicts the spec, fix the journey.

2. **Code bug:** The application does not do what the spec says. The assertion correctly describes
   the expected behaviour. Fix the code. Update `defect_register.md`.

3. **Spec bug:** Neither the journey nor the code is wrong. The spec requirement is unclear,
   self-contradictory, or missing. Update `feature_spec.md` with a `chore(spec):` commit, update the
   journey, then fix the code.

**The journey register note:** Every stage in `v1.js` that is expected to fail (open defect) carries
`xfail: true` and a defect reference. An xfail that starts passing is a `test.fails()` regression
(strict mode): it must be converted to a passing test and the defect marked CLOSED.

---

## 12. Playwright integration (Phase 35)

`scripts/simulate-journey.js` runs the full 30-day journey and writes the result to a tmpfile:

```bash
node scripts/simulate-journey.js --out /tmp/journey.db
DATA_DIR=/tmp/journey.db npx playwright test -c playwright.journey.config.js
```

`playwright.journey.config.js` uses `ENGINE_MODE=fake` and points `DATA_DIR` at the simulated DB.
It does not play any games. It navigates to the existing UI pages and takes screenshots + DOM assertions
at the 10 journey stages listed in `user_journey.md`.

The two Playwright configs are deliberately separate:
- `playwright.config.js` — real E2E with native engines; runs in CI with engines installed.
- `playwright.journey.config.js` — simulated DB, fake engines; runs everywhere, no engine binary.

---

## 13. npm run journey

`package.json` gains:

```json
"journey": "vitest run tests/support/journey/ --reporter=verbose"
```

This is distinct from `npm test` (which runs all unit tests). The journey suite is intentionally
slow (it simulates 30 days of play) and is run explicitly.

`make verify` does NOT run `npm run journey`. Journey tests are a separate gate, run before any
merge that touches `src/api/ws/`, `src/domain/repertoire/`, or `tests/support/journey/`.
