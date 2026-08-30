# Phase 26 — Production Readiness Review

**Branch:** `docs/phase-26-repertoire-review`  
**Date:** 2026-08-30  
**Status:** Complete — 6 findings, 5 fixed, 1 accepted with justification.

---

## 1. Requirements completeness

All 10 phases (17–26) specified in `feature_steps.md` are implemented and committed.

Verified present:

- **Book model**: EPD keying, 7 roles, accepted/alerting sets, vote algorithm, alternation
- **Gates**: 4 gates (admission, absolute floor, cumulative budget, forced-mate proxy)
- **Coach overlay**: hold/timeout/keep/correct flow, `REP_ALERTS_PER_GAME_MAX`, `coach_enabled` guard
- **Challenge service**: 9 resolution rules, TTL, reversal suppression, `settled_both` path
- **Drill integration**: opening puzzle creation, `accepted_moves_json`, exempt from `FINDABILITY_MIN`
- **Coverage reporting**: reach probability, expected depth, gap list, frontier threshold
- **REST + WS API**: 6 repertoire REST routes, WS `repertoire_alert` / `repertoire_choice` messages
- **Export / research dataset**: deterministic NDJSON export with SHA-256 manifest
- **Coach `coach_enabled` flag**: `games.coach_enabled` column, `_checkBookAlert` guard (D3, fixed this review)
- **Schema migration**: `puzzles` UNIQUE(fen) → UNIQUE(fen, kind)

**Finding D3** (fixed below): `coach_enabled = 0` guard was missing from `_checkBookAlert`. Implemented this review.

**Finding D4** (accepted below): `FR-REP-COACH-14` (`saveStrengthSample` guard) deferred — strength sampling is not yet implemented.

---

## 2. Interface correctness

`InboundMessageSchema` (Zod) validates all WS messages before dispatch.  
`NewGameMessageSchema` updated this review to include `coachEnabled: z.boolean().optional().default(true)` (D3 fix).  
REST routes at `/api/repertoire` are mounted in `src/server.js` (line 85) and tested via supertest.  
WS alert/choice state machine matches `api_contract.md`: hold → alert → (keep/correct/timeout).  
`rep_challenges` row written in the same transaction as the `alerted_kept` deviation (FR-REP-CHAL-1).

---

## 3. Error handling

Repertoire errors are swallowed and logged at `warn`/`error` — they never fail a move or game (FR-REP-COACH-11).  
`_checkBookAlert` always returns `false` on any error path (bootstrap not met, not in alerting set, no canonical).  
`challenge-service.js` `resolveOpenChallenges` swallows individual challenge errors so one bad row cannot block the rest.  
`rep_deviations` write inside the move transaction: if it fails, the move is rejected (explicit exception to swallow rule — documented in design_plan.md §NFR).

**Finding D1** (fixed Phase 26): `qualifiesForAlternation` in `_gatherEvidence` always returned `false`, making `settled_both` structurally unreachable. Fixed in Phase 26: properly computes incumbent and challenger observation counts within the recency half-life window.

**Finding D2** (fixed Phase 26): `settled_both` branch had 0% test coverage. Fixed in Phase 26 by adding service-level test with `playedAt = Date.now() - 1000`.

---

## 4. Observability

Pino child logger (`{ mod: 'ws-handlers' }` etc.) in every module.  
`_checkBookAlert` logs at `debug` on each call path.  
`resolveOpenChallenges` logs resolved challenges at `info`.  
Analysis pipeline emits `onProgress` events — wired to WS `analysis_progress`.  
`rep_changelog` records every book-state change with `provenance_id` and `book_version` (invariants 11–12).

---

## 5. Security

`games.coach_enabled` defaults to 1; no user-supplied classification of moves is stored (invariant 10).  
No SQL injection surface — all repo methods use parameterised `better-sqlite3` statements.  
`BIND_ADDR` defaults to `127.0.0.1` (no default LAN exposure).  
Weights are gitignored; `npm audit --audit-level=high` passes.

---

## 6. Performance

NFR live-path: `_checkBookAlert` makes zero engine calls — DB reads only (tested: FR-REP-COACH-10).  
Post-game repertoire update: at most 2 `go depth 22` calls per open challenge, at most once per challenge.  
Maia policy probes are background-only and cached per `(epd, model)` (NFR in design_plan.md).  
Reach probability and gap report are pure in-memory computations over the projected `rep_nodes`/`rep_moves` tables.

---

## 7. Testing

**Coverage gate:** 90.12% branches (1479/1641) over `src/domain/**`, `src/adapters/**`, `src/api/**`, `src/shared/**`. Threshold: 90%. Gate passes.

**Test count at phase 26:** 799 tests (797 passing + 2 expected fails), 42 test files.

### Invariant coverage

| # | Invariant | Test | Status |
|---|-----------|------|--------|
| 1 | At most one canonical per (epd, side); exactly one role per move | `state: accepted set` + `state: alerting set` in `domain.test.js` | ✓ |
| 2 | refused/retired not in accepted set; quarantined not canonical | `state: accepted set contains canonical, alt, challenger, quarantined` | ✓ |
| 3 | append-only tables (observations, deviations, challenges, audits, changelog) | FR-REP-STORE-1 invariant 3 test in `repositories.test.js` | ✓ |
| 4 | rep_nodes/rep_moves byte-reproducible from source tables + constants | FR-REP-STORE-3/4 rebuild tests in `seed-repertoire.js` | ✓ |
| 5 | Every rep_challenges row references an existing (epd, side) and incumbent | FR-REP-CHAL-1 `handleMove: rep_challenges row committed with move` | ✓ |
| 6 | Closed challenge has resolved_at, resolved_by, resolution_rule | FR-REP-CHAL-7 `challenge: promotion writes retired + canonical + changelog` | ✓ |
| 7 | Canonical node has a kind='opening' puzzle and FSRS card | `invariant 7` in `drill.test.js:108` (flipped from `test.fails` at Phase 23) | ✓ |
| 8 | No move becomes canonical without a rep_audits row at REP_AUDIT_DEPTH | FR-REP-GATE-5 invariant 8 test | ✓ |
| 9 | ranked=0 for any game with an alerted_ deviation | FR-REP-COACH-4 `handleMove: ranked flip on first alert` | ✓ |
| 10 | Challenge resolves only via numbered rules or explicit reversal; no user-supplied classification | FR-REP-CHAL-4 rules 1–9 tests in `domain.test.js` | ✓ |
| 11 | Every append-only row carries non-null provenance_id and book_version | FR-REP-STORE-2 invariants 11, 12 tests | ✓ |
| 12 | book_version strictly monotonic, increments once per book change | FR-REP-STORE-5 invariant 12 test | ✓ |
| 13 | Two exports at same book_version are byte-identical | FR-REP-STORE-6; `export.test.js` determinism tests | ✓ |
| 14 | No canonical from fewer than REP_CONFIRM_OBS self-directed observations | `precondition: no canonical below REP_CONFIRM_OBS` in `domain.test.js:645` | ✓ |
| 15 | alerted_timeout/post_game deviations open no challenge | `invariant 15: timeout deviation has no challenge` in `challenge-service.test.js:341` | ✓ |

All 15 invariants have passing tests.

### NFR bound coverage

| Bound | Test |
|-------|------|
| Zero engine calls on live path | FR-REP-COACH-10 |
| Maia policy probes cached, never on request path | `reach: cached per (epd, weights_id)` FR-REP-REACH-2 |
| Repertoire error swallowed — move never fails | FR-REP-COACH-11 |
| Refusal committed in same transaction as move | FR-REP-CHAL-1 |

---

## 8. Deployment

`scripts/seed-repertoire.js` supports `--rebuild` flag (FR-REP-STORE-3/4).  
`scripts/export-research-dataset.js` produces deterministic NDJSON + SHA-256 manifest (FR-REP-STORE-6).  
`src/server.js` mounts `/api/repertoire` router and injects `repertoireRepo` into WS (FR-REP-API-4).  
`public/repertoire.html` and `public/js/repertoire.js` present the repertoire browser UI (Phase 24).  
All five research documents in `docs/research/` are present and populated.  
All REP_* constants documented in `docs/game/balance.md` with rationale and sensitivity analysis.

**Finding D5** (fixed this review): `traceability.md` had a stale instruction "*(Fill implementation column...)*". Removed; status updated to Complete.

**Finding D6** (fixed this review): `feature_steps.md` Phase 17 header and Phase 26 status were both "In progress / Not started". Updated to "Complete — 2026-08-30".

---

## Summary

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| D1 | High | `qualifiesForAlternation` always `false` — `settled_both` structurally unreachable | Fixed (Phase 26) |
| D2 | High | `settled_both` branch at 0% test coverage | Fixed (Phase 26) |
| D3 | Medium | `coach_enabled = 0` guard absent from `_checkBookAlert`; column existed but never read | Fixed (this review) |
| D4 | Low | `saveStrengthSample` guard (FR-REP-COACH-14) — `saveStrengthSample` not yet implemented | Accepted — deferred; placeholder comment in `analysis-service.js:184` documents the guard contract for when strength sampling is added |
| D5 | Minor | `traceability.md` stale fill-in instruction | Fixed (this review) |
| D6 | Minor | `feature_steps.md` phase statuses not updated | Fixed (this review) |

`make verify` green. All 15 invariants pass. Branch coverage 90.12% ≥ 90% threshold.

---

## Amendment — 2026-08-30 (Phase 37 reconciliation)

The Phase 26 review passed on the wrong evidence. The review method was: verify that tests exist and
pass, that coverage meets the gate, and that all requirements have at least one test reference in
`traceability.md`. What it did **not** verify was that the features those tests describe are reachable
from a running application.

**What the method missed**

The review checked pure domain functions in isolation. Unit tests for `resolveChallenge`, `build.js`,
and `reach.js` all pass their dependencies directly — they do not exercise the seams between domain
functions and the service layer that calls them. Phases 27–35 explored those seams and found:

- **15 behavioural defects** where a tested domain function had no caller in the service layer, or
  the service layer computed a dependency incorrectly before passing it in (examples: `engineDelta`
  never written so rules 2–5 can never fire; `electCanonical` never called so the vote algorithm
  never runs; `buildTimeline` and `buildGrowthSeries` had no consumer until Phase 36).
- **12 UI gaps** where REST routes existed with tests but the responses were never consumed by the
  browser client (example: `repertoire_update` was broadcast by the server and unhandled by every
  client).
- **3 documentation defects** where `traceability.md` pointed requirements at source files rather
  than test files, and `api_contract.md` described field names that had been renamed in earlier phases.

The coverage gate (90.12% ≥ 90%) passed throughout. Coverage measures which lines a test suite
reaches, not whether the application is wired correctly end-to-end. The gate is a necessary but not
sufficient condition for a feature being usable.

**What a better method would have looked like**

A review that tests reachability from the running application would check: (1) that every domain
function has at least one integration test that calls it through the real handler with a real DB, not
only through direct unit-test invocation; (2) that every REST route has a test that verifies the
response shape matches a real client handler; (3) that every WS message type the server emits has a
test that the client handles it. The journey harness built in Phase 28 is that instrument.

The 30 defects found in Phases 27–35 are fully documented in `defect_register.md` with their closing
phases and tests. All blocking defects are closed. D1/D2/D3 (documentation) are closed in Phase 37.
U12 (line-health panel) is accepted at low severity.
