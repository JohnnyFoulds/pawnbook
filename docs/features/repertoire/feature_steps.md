# Feature steps — auto-repertoire (Phases 17–26)

Every test name below is written before implementation. Tests for future phases use `test.fails(...)`
with `await import()` inside the body, per the project convention. Tests with `[Phase 23]` are
deferred until drill integration exists.

---

## Phase 17 — Specification (no code)

**Status:** Complete — 2026-08-30

**Branch:** `docs/phase-17-repertoire-spec`  
**Files:** `docs/features/repertoire/`, `docs/research/`, `docs/game/balance.md`

**DoD:**
- SDD §9 completeness checklist passes (see `spec_review.md`)
- Every FR is MUST/SHOULD/MAY; every error has code and HTTP status; every NFR has a measurable bound
- `data_model.md` and `api_contract.md` are complete enough to derive the code from
- `spec_review.md` is filled in
- `repertoire-study-preregistration.md` is committed before any coached game is played
- In `auto-repertoire-prior-art.md` every factual claim carries a URL and access date, every quoted
  feature claim is verbatim, and every null result records the exact query, source and date
- `design_plan.md` is committed as provenance record
- No file under `src/` is touched in this phase

---

## Phase 18 — Pure domain core (TDD)

**Status:** Not started

**Branch:** `feat/phase-18-repertoire-domain`  
**Files:** `src/domain/repertoire/` (new):
- `epd.js` — EPD key extraction and representative FEN storage
- `gates.js` — the four soundness checks
- `vote.js` — recency-weighted canonical selection
- `state.js` — role transitions
- `deviation.js` — the classification table (§5)
- `reach.js` — reach probability, coverage %, gap ranking, drop-out priority
- `challenge.js` — §9 — the three signals and the promotion rules

No I/O, no engine, no persistence. All pure functions.

```
epd: extractEpd returns the first four FEN fields only
epd: two positions differing only in fullmove counter have the same EPD
epd: representative FEN round-trips through chess.js

gates: loss < 10 → admitted
gates: loss exactly 10 → quarantined (not admitted)
gates: loss exactly 20 → refused (not quarantined)
gates: loss >= 20 → refused
gates: absolute floor skipped when engine best also below threshold
gates: gate 3 skipped when no book path exists
gates: gate 3: three consecutive 8-point losses refused at third
gates: forced mate → refused
gates: all four pass → admitted

vote: canonical is the move with highest recency-weighted score
vote: recency half-life gives older observations less weight
vote: tie-broken by mean_win_loss_pts then score
vote: alternation: two moves each ≥ REP_ALT_ALTERNATION_MIN within half-life → settle as canonical + alt

state: candidate on first observation; never canonical from single observation
state: candidate → canonical after REP_CONFIRM_OBS self-directed observations + gate pass
state: coach_corrected source not counted toward observations
state: quarantined on gate 1 in [10,20)
state: refused on gate 1 ≥ 20
state: quarantine exit: clean re-audit → alt; worse re-audit → refused
state: canonical → retired when vote overtaken by passing rival
state: node with no canonical is silent (no admissible move)

deviation: in_book_canonical → silent for canonical move
deviation: in_book_alt → silent for alt move
deviation: refused_repeat → alert when refused move played and node has canonical
deviation: refused_repeat falls through to new_territory when node has no canonical ← regression test 8
deviation: transposition → silent; edge recorded
deviation: new_territory → silent; observation recorded
deviation: order_slip scoped to book-reachable nodes
deviation: order_slip not triggered at unreachable nodes ← unscoped regression test 13
deviation: lapse requires drill history (fails before Phase 23)
deviation: novelty when no drill history
deviation: first-match-wins — refused_repeat beats transposition when both match

reach: reach_prob = product of maia policy over opponent plies
reach: coverage_pct = sum(reach covered) / sum(reach all) within REP_PLY_MAX
reach: gap_list contains replies above 1/REP_COVERAGE_GOAL not in book
reach: expected_depth weighted by reach
deviation: order_slip scoped to book-reachable nodes only

challenge: engine_delta sign: winPct(challenger) - winPct(incumbent), positive = better ← sign regression
challenge: gate veto beats good results (rule 1 fires before rule 2)
challenge: engine-clear promotes when engine_delta ≥ REP_CHALLENGE_ENGINE_CLEAR ← rule 2
challenge: single-observation challenger → alt not canonical (invariant 14) ← regression test 2
challenge: repeat-plus-neutral promotes at challenger_plays ≥ REP_CHALLENGE_REPEAT_CONFIRM ← rule 3
challenge: repeat-plus-neutral requires no results data at all
challenge: rule 3 reachable without second alert (play unprompted) ← regression test 1
challenge: evidence promotes with trend or result over REP_CHALLENGE_MIN_GAMES ← rule 4
challenge: style-call: engine dislikes but results support → promoted not escalated ← rule 5
challenge: incumbent replayed → rejected ← rule 6
challenge: abandoned at REP_CHALLENGE_TTL_ENCOUNTERS encounters ← rule 7
challenge: TTL counted in node encounters not games ← regression test 7
challenge: neither move alerts while challenge open ← rule 8
challenge: vote suspended while challenge open
challenge: alternation → settled_both canonical+alt not flip ← rule 9
challenge: promotion writes incumbent→retired challenger→canonical
challenge: precondition: no canonical below REP_CONFIRM_OBS observations ← invariant 14
challenge: timeout opens no challenge ← regression test 3 + invariant 15
challenge: post_game opens no challenge ← invariant 15
challenge: coach_corrected does not advance confirmation or vote ← regression test 4
challenge: reversal suppression: re-run same evidence does not re-promote ← regression test 5
challenge: line_loss = minimum over paths not max ← regression test 6
challenge: line_loss updated when cheaper path added ← regression test 6b
```

**DoD:** `make verify` green; ≥90% branch coverage on `src/domain/repertoire/**`.

---

## Phase 19 — Persistence, provenance and port

**Status:** Not started

**Branch:** `feat/phase-19-repertoire-persistence`  
**Files:**
- `src/adapters/sqlite/schema.js` — all new DDL, including `rep_audits`, `rep_suppressions`,
  `games.coach_enabled`; `puzzles` UNIQUE migration
- `src/ports/repositories.js` — `RepertoireRepository` port definition
- `src/adapters/sqlite/repositories.js` — SQLite implementation
- `src/adapters/memory/repositories.js` — in-memory implementation
- `tests/contract/repositories.test.js` — shared contract tests

```
schema: rep_observations table created with correct columns
schema: rep_deviations resolution enum has exactly four values
schema: rep_challenges status enum has exactly six values
schema: rep_audits created with provenance_id and book_version
schema: rep_changelog kind enum has exactly six values
schema: rep_suppressions primary key (epd, side, move_uci)
schema: rep_book_version single-row constraint enforced
schema: games.coach_enabled column exists with default 1
schema: puzzles UNIQUE(fen,kind) after migration
schema: migration preserves all existing puzzle rows with kind='tactics'
schema: no rows lost after puzzles migration ← migration regression

provenance: saveProvenance returns id; identical context reuses same row
provenance: book_version increments in same transaction as book change (invariant 12)
provenance: two increments produce different book_versions

repertoireRepo SQLite: saves and loads observation
repertoireRepo SQLite: saves and loads deviation
repertoireRepo SQLite: saves and loads challenge; challenge row committed with move
repertoireRepo SQLite: saves audit row with provenance_id
repertoireRepo SQLite: rebuild reads from append-only tables only
repertoireRepo memory: same contract as SQLite ← contract test
```

**DoD:** `make verify` green; contract tests pass for both implementations; invariants 4, 11, 12, 15
tested.

---

## Phase 20 — Seeding and post-game update

**Status:** Not started

**Branch:** `feat/phase-20-repertoire-seeding`  
**Files:**
- `src/domain/repertoire/build.js` — pure: observations + evals → book operations
- `src/domain/repertoire/service.js` — application service (thin layer over domain + repo)
- Hook in `src/api/ws/analysis-service.js` — after `move_evals` saved
- `scripts/seed-repertoire.js` — idempotent batch; `--rebuild` flag

```
build: new observation produces candidate
build: second self-directed observation triggers confirmation attempt
build: coach_corrected observation does not trigger confirmation
build: passing candidate becomes canonical
build: failing candidate becomes refused or quarantined per gate
build: quarantined candidate re-confirmed when audit improves
build: quarantined candidate refused when audit worsens
build: idempotent: running twice produces same result
build: rebuild: same result as incremental from same observations

seed-script: processes all analysed games
seed-script: --rebuild drops projections and rebuilds from append-only tables
seed-script: two consecutive rebuilds produce byte-identical projections ← rebuild determinism
seed-script: audit-depth mismatch causes rebuild to refuse not silently mix depths

service: repertoire failure does not fail analysis (swallowed with log)
service: sends repertoire_update WS summary after book update
```

**DoD:** `make verify` green; seeding script processes a 10-game fixture; rebuild is deterministic.

---

## Phase 21 — Live coach and refusal capture

**Status:** Not started

**Branch:** `feat/phase-21-repertoire-coach`  
**Files:**
- `src/api/ws/handlers.js` — pre-commit check in `handleMove`; `repertoireRepo` injected
- `src/schemas/messages.js` — `RepertoireChoiceSchema` (strict), `RepertoireAlertSchema`
- `src/domain/game/session.js` — `GameSession.setUnranked()`
- `src/api/ws/analysis-service.js` — strength-sample guard extended for coached games
- `src/errors.js` — new error codes

```
schema: RepertoireChoiceSchema rejects extra fields ← no-classification test
schema: RepertoireChoiceSchema rejects decision values other than correct/keep
schema: RepertoireAlertSchema validates required fields

handleMove: move held when alert triggered; client receives repertoire_alert
handleMove: decision=correct applies book move; observation source=coach_corrected
handleMove: decision=keep applies player move; rep_deviations + rep_challenges written in same transaction
handleMove: refusal committed before move response ← durability test
handleMove: decision=keep: rep_challenges row present after simulated crash ← crash durability
handleMove: timeout: player move applied; no challenge row; resolution=alerted_timeout ← regression test 3
handleMove: alert budget: 4th deviation recorded as post_game no challenge ← regression test 3
handleMove: ranked flip on first alert; ranked_changed event emitted
handleMove: clock paused during hold; resumed on decision or timeout
handleMove: coach_enabled=0 game: no alert raised
handleMove: coach silent before REP_BOOTSTRAP_CONFIRMED_MIN confirmed nodes
handleMove: node with no canonical: no alert ← regression test 8
handleMove: repertoireRepo received as injected dependency not module-level import
handleMove: repertoire error swallowed; move proceeds ← FR-REP-COACH-11

session: setUnranked() transitions ranked from true to false
session: setUnranked() is a state change (constructor derives ranked; setter changes it)

analysis-service: saveStrengthSample not called for coached games ← NFR regression test
analysis-service: saveStrengthSample still called for coach_enabled=0 ranked games
```

**DoD:** `make verify` green; NFR test asserts zero engine calls on the live path; p99 check passes
against synthetic book; all invariants 9, 10, 11, 15 tested.

---

## Phase 22 — Reach, coverage, health and challenge resolution

**Status:** Not started

**Branch:** `feat/phase-22-repertoire-challenges`  
**Files:**
- Background policy probe service
- Coverage/gap/health computation
- Challenge A/B engine calls; trend extraction; result aggregation
- Auto-resolution rules in `challenge.js` + learning pass trigger
- `src/api/routes/repertoire.js` — all six routes
- `src/server.js` — mount routes
- `scripts/repertoire-report.js`

```
reach: policy computed lazily in background; not on request path ← NFR
reach: cached by (epd, maia_weights_id); weights upgrade invalidates cache
coverage: coverage_pct formula matches FR-REP-REACH-3 definition
coverage: expected_depth weighted by reach probability
gap: returns opponent replies above 1/REP_COVERAGE_GOAL not covered

challenge: engine A/B uses same depth/multipv as REP_AUDIT_DEPTH/REP_AUDIT_MULTIPV
challenge: both moves written to rep_audits with provenance
challenge: trend extraction uses REP_CHALLENGE_TREND_PLIES forward only
challenge: result_challenger_perf uses Elo-adjusted formula FR-REP-CHAL-6
challenge: all nine rules resolve correctly ← suite from Phase 18 re-run with persistence
challenge: reversal writes rep_suppressions; suppression blocks re-promotion ← regression test 5

routes: GET /tree returns nodes with roles and reach
routes: GET /coverage returns coverage_pct and gap list
routes: GET /challenges returns open and recent
routes: GET /refusals includes inferred_interpretation
routes: GET /changelog most-recent-first
routes: POST /changelog/:id/reverse reverses, writes suppression, returns suppressedUntil
routes: POST /changelog/:id/reverse 409 on already-superseded change
routes: repertoire error in route returns 500, not unhandled rejection
```

**DoD:** `make verify` green; `scripts/repertoire-report.js` produces sensible output on fixture DB.

---

## Phase 23 — Drill integration

**Status:** Not started

**Branch:** `feat/phase-23-repertoire-drill`  
**Files:**
- `src/domain/repertoire/build.js` — card creation on confirmation
- `src/domain/puzzles/select.js`, `src/domain/review/queue.js`, `src/domain/review/rating.js`
  — findability exemption for opening cards
- Tests previously written as `test.fails(...)` — flip here

```
drill: canonical move confirmation writes kind='opening' puzzle row ← invariant 7 flipped
drill: accepted_moves_json contains canonical + alts + open challenger
drill: accepted_moves_json does not contain quarantined ← invariant 2
drill: due opening cards sorted by reach_prob descending
drill: opening cards exempt from FINDABILITY_MIN filter in select.js
drill: opening cards exempt from FINDABILITY_MIN filter in queue.js
drill: opening cards exempt from FINDABILITY_MIN filter in rating.js
drill: puzzles UNIQUE(fen,kind) allows same FEN as tactics and opening
```

**DoD:** `make verify` green; invariant 7 test is no longer `test.fails`.

---

## Phase 24 — UI

**Status:** Not started

**Branch:** `feat/phase-24-repertoire-ui`  
**Files:** `public/repertoire.html`, `public/play.html` (alert overlay), `tui/screens/repertoire.js`

```
ui: alert overlay renders book-move arrow and exactly two buttons
ui: "Play book move" button sends decision=correct
ui: "Keep mine" button sends decision=keep
ui: unranked badge appears after first alert
ui: changelog feed shows rule and numbers behind each change
ui: changelog feed has reverse button per reversible entry
ui: refusal log shows retrospective hit-rate
ui: open challenges shown read-only as "being worked out"
ui: repertoire tree shows three-objective stats per node
```

**DoD:** `make verify` green; manual walkthrough (see §Verification hand-test).

---

## Phase 25 — Research instrumentation and dataset export

**Status:** Not started

**Branch:** `feat/phase-25-research-export`  
**Files:**
- `scripts/export-research-dataset.js`
- `scripts/repertoire-analysis.js`
- `docs/research/repertoire-data-dictionary.md` — finalised

```
export: two consecutive exports at same book_version are byte-identical ← invariant 13
export: manifest SHA-256 verifies
export: --anonymise flag removes identifying fields
export: every field in export appears in data-dictionary and vice versa
export: PGN of every game is included

analysis: RQ2 coverage curve computable from export only (not live DB)
analysis: RQ1 refusal hit-rate table computable from export only
analysis: RQ5 reliability diagram + Brier score computable from export only
analysis: every RQ in preregistration either computable or marked awaiting-data
```

**DoD:** `make verify` green; byte-identity test passes; every preregistration RQ covered.

---

## Phase 26 — Production readiness review

**Status:** Complete — 2026-08-30

**Branch:** `docs/phase-26-repertoire-review`  
**Files:** `docs/features/repertoire/phase-26-review.md`

Format: numbered findings `D1…Dn`, each resolved or explicitly accepted, in the same format as
`docs/features/pawnbook/phase-11-review.md`.

**Covers:**
- All 15 invariants tested (run invariant suite, confirm green)
- Coverage gate passes
- Fagan-style spec conformance re-inspection (§7.3 of SDD standard):
  1. Interface conformance
  2. Precondition enforcement
  3. Postcondition satisfaction
  4. Error semantics
  5. Non-functional constraints
- `traceability.md` has no unfilled row
- `make verify` green

**DoD:** Phase-26-review.md merged; every finding is resolved or accepted with justification.

---

## Phase 27 — Composition root, injected clock/scheduler/ids/engine, B15 fix

**Status:** Complete — 2026-08-30

**Branch:** `feat/phase-27-composition-root`  
**Commit:** `756834d`

**Covers:**
- `src/app.js` extracted as the composition root: `createApp({db, clock, scheduler, enginePool})`
- `clock` threaded into `updateRepertoire`, `resolveOpenChallenges`, `_checkBookAlert`, `_applyChoiceMove`
- `scheduler` port + `ManualTimer` / `RealTimer` adapters; `setTimeout` replaced in `handlers.js`
- `ids` port + `SequentialIds` / `UuidIds` adapters; `randomUUID` replaced in `handlers.js`
- `src/adapters/engine/fake-engine-pool.js` — deterministic eval engine for tests; `ENGINE_MODE=fake`
- **B15 fixed:** `InMemoryGameRepository._normaliseMoveEval()` now returns snake_case fields so
  `getEvals()` contracts match SQLite; gate verdicts no longer silently `admitted` in in-memory tests
- `tests/unit/adapters/phase-27-adapters.test.js` — 19 tests covering all new adapters

**DoD:** `make verify` green; branch coverage ≥ 90%; B15 contract test passes.

---

## Phase 28 — The journey harness

**Status:** Complete — 2026-08-30

**Branch:** `feat/phase-28-journey-harness`

**Covers:**
- `tests/support/journey/` harness — `harness.js`, `eval-model.js`, `journey-dsl.js`, `probes.js`,
  `journeys/v1.js`, `index.js`
- `tests/journey/repertoire-v1.test.js` — 15-test vitest suite running V1_JOURNEY
- `scripts/simulate-journey.js` — CLI writing populated DB for Playwright visual testing
- `docs/features/repertoire/user_journey.md` — 30-day narrative in three acts
- `docs/features/repertoire/longitudinal_test_plan.md` — harness architecture and assertion taxonomy
- `docs/features/repertoire/simulation_fixtures.md` — eval model and scripted game lines
- `docs/features/repertoire/defect_register.md` — full defect register (32 open, 1 closed)
- `package.json` — `"journey"` script added

**Key decisions:**
1. Always SQLite (`:memory:` under vitest, tmpfile for Playwright) — never `InMemoryGameRepository`
2. Programmatic CP-band eval model derived from `balance.js` and validated at load time
3. Write-counting repository proxy (`WriteProxy`) guards against direct state setup

**Journey result at Phase 28:**
- Stage 2 xpass (basic candidate confirmation works without `electCanonical`)
- Stages 4, 5, 6, 8, 9 correctly xfail (open defects B3, B2, B7, U3)
- All other stages pass or soft-pass

**DoD:** `npm run journey` green; all xfail defects documented in `defect_register.md`; every
xpass is a confirmed or intentional behaviour change.
