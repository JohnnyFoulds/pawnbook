# Implementation plan — auto-repertoire

**Status:** Phase 17 — 2026-08-29  
Per-session checklist. Each session turns the listed tests green. Suggested commit messages follow
the `type(scope): subject` convention; co-authorship attribution MUST NOT be included.

---

## Phase 18 — Pure domain core

**Session target:** All tests in `feature_steps.md §Phase 18` green.  
**Files to create:** `src/domain/repertoire/{epd,gates,vote,state,deviation,reach,challenge}.js`  
**Test file:** `tests/unit/repertoire-domain.test.js`

Session checklist:
1. Write all test names as `test.fails(...)` with `await import()` bodies.
2. Implement `epd.js` — flip passing.
3. Implement `gates.js` — flip passing.
4. Implement `vote.js` + `state.js` — flip passing.
5. Implement `deviation.js` — flip passing, including regression tests 1, 7, 8.
6. Implement `reach.js` — flip passing.
7. Implement `challenge.js` — flip passing, including regression tests 2, 3, 4, 5, 6.
8. `make verify` green. ≥90% branch coverage on `src/domain/repertoire/**`.

Suggested commit: `feat(repertoire): add pure domain core — book structure, gates, vote, challenge`

---

## Phase 19 — Persistence, provenance and port

**Session target:** Schema DDL + both repository implementations + contract tests.  
**Files to create/modify:**
- `src/adapters/sqlite/schema.js` — new DDL
- `src/ports/repositories.js` — `RepertoireRepository` port
- `src/adapters/sqlite/repositories.js` — SQLite implementation
- `src/adapters/memory/repositories.js` — in-memory implementation
- `tests/contract/repositories.test.js` — shared contract cases

Session checklist:
1. Add DDL (append-only tables + projections + provenance) with idempotent CREATE IF NOT EXISTS.
2. Add `games.coach_enabled` ALTER-in-try.
3. Add `puzzles` UNIQUE migration with table-rebuild pattern.
4. Define `RepertoireRepository` port (interface + doc).
5. Implement SQLite adapter; write contract tests; flip passing.
6. Implement in-memory adapter; confirm contract tests pass for both.
7. `make verify` green.

Suggested commits:
- `feat(schema): add repertoire tables, provenance, book_version counter`
- `feat(schema): migrate puzzles UNIQUE(fen) → UNIQUE(fen, kind)`
- `feat(repertoire): add RepertoireRepository port and both implementations`

---

## Phase 20 — Seeding and post-game update

**Session target:** Book builds from finished games; `--rebuild` is deterministic.  
**Files to create/modify:**
- `src/domain/repertoire/build.js`
- `src/domain/repertoire/service.js`
- `src/api/ws/analysis-service.js` — hook after move_evals saved
- `scripts/seed-repertoire.js`

Session checklist:
1. Write `build.js` tests (pure; no I/O).
2. Implement `build.js`; flip passing.
3. Write seeding script tests (idempotency, rebuild determinism).
4. Implement `service.js` + hook in `analysis-service.js` with swallow-all-errors wrapper.
5. Implement `scripts/seed-repertoire.js` with `--rebuild`.
6. Run against a 10-game fixture; verify book fills correctly.
7. Run rebuild twice; assert byte-identical projections.
8. `make verify` green.

Suggested commit: `feat(repertoire): add post-game book building, seeding script, rebuild`

---

## Phase 21 — Live coach and refusal capture

**Session target:** Alert fires in-game; refusal committed durably; no extra engine calls.  
**Files to modify:**
- `src/api/ws/handlers.js`
- `src/schemas/messages.js`
- `src/domain/game/session.js`
- `src/api/ws/analysis-service.js`
- `src/errors.js`

Session checklist:
1. Add `RepertoireChoiceSchema` and `RepertoireAlertSchema` to `messages.js`; tests passing.
2. Add error codes to `errors.js`.
3. Add `GameSession.setUnranked()`; test passing.
4. Add repertoire check to `handleMove`; write all tests as `test.fails` first.
5. Inject `repertoireRepo` into `handleMove` dep object; update `src/server.js` injection.
6. Implement pre-commit hold + alert send + clock pause.
7. Implement `decision = 'correct'` path.
8. Implement `decision = 'keep'` path — challenge write in same transaction as move.
9. Implement timeout path — no challenge.
10. Implement post-budget path — no alert, no challenge, `post_game` record.
11. Extend strength-sample guard in `analysis-service.js`.
12. Run NFR test: assert engine client never touched on live path.
13. Run crash-durability test.
14. `make verify` green.

Suggested commits:
- `feat(repertoire): add live coach pre-commit check and repertoire_alert WS message`
- `feat(repertoire): capture refusals as rep_challenges in move transaction`
- `fix(analysis): exclude coached games from strength sampling`

---

## Phase 22 — Reach, coverage, health and challenge resolution

**Session target:** Challenges resolve automatically; REST routes serve the book.  
**Files to create/modify:**
- Background policy service
- `src/domain/repertoire/challenge.js` — augment with persistence (uses repos)
- `src/api/routes/repertoire.js`
- `src/server.js` — mount routes
- `scripts/repertoire-report.js`

Session checklist:
1. Write coverage/gap tests; implement `reach.js` persistence.
2. Write challenge engine A/B tests; implement.
3. Write auto-resolution tests (all 9 rules, plus regression test 5 with persistence).
4. Implement resolution loop in learning pass.
5. Implement all six REST routes; test with fixture DB.
6. Mount in `src/server.js`.
7. Implement `scripts/repertoire-report.js`; run on fixture and verify output.
8. `make verify` green.

Suggested commits:
- `feat(repertoire): add background reach probability computation and coverage report`
- `feat(repertoire): add challenge auto-resolution with engine A/B and suppression`
- `feat(repertoire): add REST API routes for book, coverage, challenges, changelog`

---

## Phase 23 — Drill integration

**Session target:** Opening cards created; findability gate exempted; invariant 7 test flipped.  
**Session checklist:**
1. Add card-creation to `build.js`; flip invariant 7 test from `test.fails`.
2. Audit and patch `select.js`, `queue.js`, `rating.js` for `kind='opening'` exemption.
3. Add reach-weighted sort to due-opening queue.
4. `make verify` green.

Suggested commit: `feat(repertoire): integrate opening drill cards with FSRS via puzzles.kind`

---

## Phase 24 — UI

**Session target:** Alert overlay and repertoire page functional.  
**Session checklist:**
1. Add alert overlay to `public/play.html` — two buttons only.
2. Add unranked badge.
3. Create `public/repertoire.html` — tree, coverage, changelog with reverse buttons, refusal log.
4. Add TUI screen under `tui/screens/repertoire.js`.
5. Run manual walkthrough (phase-verification hand-test).
6. `make verify` green.

Suggested commit: `feat(repertoire): add UI — alert overlay, repertoire page, TUI screen`

---

## Phase 25 — Research instrumentation and dataset export

**Session target:** Byte-identical exports; all RQs computable.  
**Session checklist:**
1. Implement `scripts/export-research-dataset.js` with manifest and `--anonymise`.
2. Run twice at same `book_version`; assert byte-identical.
3. Implement `scripts/repertoire-analysis.js` for RQ1, RQ2, RQ5.
4. Finalise `docs/research/repertoire-data-dictionary.md`.
5. Assert every exported field appears in the data dictionary and vice versa.
6. `make verify` green.

Suggested commits:
- `feat(research): add dataset export script with SHA-256 manifest`
- `docs(research): finalise data dictionary and analysis scripts`

---

## Phase 26 — Production readiness review

**Session target:** All 15 invariants pass; traceability matrix complete; review doc produced.  
**Session checklist:**
1. Run invariant suite; confirm all 15 green.
2. Verify `traceability.md` has no unfilled row.
3. Run Fagan-style inspection (interface conformance, precondition enforcement,
   postcondition satisfaction, error semantics, non-functional constraints).
4. Write `docs/features/repertoire/phase-26-review.md` with findings `D1…Dn`.
5. Resolve or explicitly accept every finding.
6. `make verify` green.

Suggested commit: `docs(repertoire): phase-26 production readiness review`
