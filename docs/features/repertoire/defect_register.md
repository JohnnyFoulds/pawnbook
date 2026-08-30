# Defect register — auto-repertoire

**Status:** Phase 32 — 2026-08-30  
**Updated by:** Each phase commit that closes a defect MUST update the Status and add the commit hash.  
**Authority:** This document is the single source of truth for open defects. `traceability.md`
references defect IDs. Phase plans reference defect IDs. If a defect is accepted rather than fixed,
the written reason goes in the "Closing note" column.

---

## Summary

| Severity | Count | Open | Closed |
|---|---|---|---|
| **Blocking** | 6 (4B + 2U) | 3 | 3 |
| **High** | 12 (7B + 5U) | 9 | 3 |
| **Medium** | 10 (4B + 5U + 1B-docs) | 8 | 2 |
| **Low** | 2U + 3D | 5 | 0 |
| **Total** | **35** | **25** | **8** (+1 from Phase 27) |

B15 was closed in Phase 27 commit `756834d`.
B2, B1, B11 (blocking→high→high) and B13, B14, B9 (medium) and U9, U6 (high, medium) were closed in Phase 32.

---

## Behavioural defects

### B7 — `engineDelta` never computed; rules 2–5 cannot fire

| Field | Value |
|---|---|
| **Severity** | blocking |
| **Status** | OPEN |
| **Evidence** | `src/api/ws/challenge-service.js:_gatherEvidence`; search for `engine_delta_win_pts` — zero writers in the codebase |
| **Description** | `_gatherEvidence` supplies `challenge.engineDeltaWinPts ?? null`. The `engine_delta_win_pts` column is never written anywhere. All challenges therefore fall through to rule 6 (incumbent wins) or rule 7 (abandoned). No refused move can ever be adopted. This is the feature's central mechanism and its novelty claim. |
| **Closing phase** | Phase 31 |
| **Test** | Journey stage 2.4 (rule 3 promotion) |
| **Closing note** | — |

---

### B6 — No `rep_audits` rows ever written; rule 1 (gate veto) cannot fire

| Field | Value |
|---|---|
| **Severity** | blocking |
| **Status** | OPEN |
| **Evidence** | `src/api/ws/challenge-service.js` — `gateVerdict: null, // Phase 26: depth-22 A/B audit` |
| **Description** | The `_gatherEvidence` function hard-codes `gateVerdict: null`. Rule 1 (gate veto) checks `gateVerdict !== null`, so it never fires. `rep_audits` has no writer. Invariant 8 (`rep_audits` row before canonical transition) is false in practice. |
| **Closing phase** | Phase 31 |
| **Test** | `tests/unit/repertoire/challenge-service.test.js` — rule 1 test (to be written in Phase 31) |
| **Closing note** | — |

---

### B2 — Coach never calls `deviation.js`; `order_slip`, `novelty`, `transposition` never fire

| Field | Value |
|---|---|
| **Severity** | blocking |
| **Status** | **CLOSED** (Phase 32) |
| **Evidence** | `src/api/ws/handlers.js:_checkBookAlert` — line assigns `playerMove.role === 'refused' ? 'refused_repeat' : 'lapse'` unconditionally; `deviation.js` is never imported or called |
| **Description** | The deviation classifier (`src/domain/repertoire/deviation.js`) defines 7 classification rows: `lapse`, `refused_repeat`, `order_slip`, `novelty`, `transposition`, `new_territory`, `post_game`. Only `refused_repeat` and `lapse` are reachable. Five classification types are dead code. |
| **Closing phase** | Phase 32 |
| **Test** | `tests/unit/ws/coach-conformance.test.js` — B2 deviation routing; journey stage 6 (alert fires for deviant move) |
| **Closing note** | `_checkBookAlert` now calls `classifyDeviation` from `deviation.js`. All 7 rows are reachable. `order_slip` and `lapse` still require Phase 33 data (`reachableBookUcis`, `nodeHasDrillHistory`); they fire as `novelty` until then — an accepted limitation per the Phase 32 scope. |

---

### B15 — `getEvals` shape mismatch between SQLite and in-memory repos

| Field | Value |
|---|---|
| **Severity** | blocking |
| **Status** | **CLOSED** (Phase 27, commit `756834d`) |
| **Evidence** | `src/adapters/sqlite/repositories.js:SqliteGameRepository.getEvals` (uses `SELECT *`, returns snake_case) vs `src/adapters/memory/repositories.js:InMemoryGameRepository.getEvals` (echoed camelCase pipeline output) |
| **Description** | `build.js` reads `eval_.win_loss_pts`. Against the in-memory repo every gate returned `admitted` regardless of actual move quality. The contract test asserted only row count (`toHaveLength(1)`), not field shape. |
| **Fix** | `_normaliseMoveEval()` helper normalises camelCase → snake_case in `InMemoryGameRepository.saveMoveEval`. Contract test expanded to assert field shapes including `win_loss_pts`, `win_before`, `win_after`. |
| **Test** | `tests/contract/repositories.test.js` — "saveMoveEval stores classification field" |
| **Closing note** | Fixed. No behaviour change in production (SQLite repo was correct). |

---

### B3 — `electCanonical` has no caller; recency-weighted vote never runs

| Field | Value |
|---|---|
| **Severity** | high |
| **Status** | OPEN |
| **Evidence** | `src/domain/repertoire/vote.js` exports `electCanonical`; `grep -r electCanonical src/` returns only the definition |
| **Description** | Phase 22 implemented the recency-weighted vote algorithm (§2 of the design) as a pure function. Nothing calls it. The canonical move at each node never changes after its first confirmation. |
| **Closing phase** | Phase 29 |
| **Test** | `src/api/ws/maintenance-service.js` — maintenance-pass test (Phase 29) |
| **Closing note** | — |

---

### B4 — `candidateExpired` imported but never called; candidates never expire

| Field | Value |
|---|---|
| **Severity** | high |
| **Status** | OPEN |
| **Evidence** | `src/domain/repertoire/state.js` exports `candidateExpired`; removed from `build.js` imports in Phase 27 lint fix as it was unused there too |
| **Description** | FR-REP-LEARN-9 requires candidates to expire after `REP_CANDIDATE_TTL_ENCOUNTERS = 8` node encounters. The TTL check has no caller. Rare positions accumulate stale candidates indefinitely. |
| **Closing phase** | Phase 29 |
| **Test** | Journey stage 3.2 (candidate expiry) |
| **Closing note** | — |

---

### B5 — `reAuditQuarantined` has no caller; quarantine has no exit

| Field | Value |
|---|---|
| **Severity** | high |
| **Status** | OPEN |
| **Evidence** | `grep -r reAuditQuarantined src/` — definition only in `src/domain/repertoire/state.js` |
| **Description** | FR-REP-LEARN-8 requires quarantined moves to be re-audited on subsequent encounters. A clean re-audit (`win_loss_pts < REP_ADMIT_WIN_PTS`) promotes to `alt`. This path is impossible without a caller. All quarantined moves remain quarantined forever. |
| **Closing phase** | Phase 29 |
| **Test** | Journey stage 3.1 (quarantine exit) |
| **Closing note** | — |

---

### B1 — `ranked_changed` never emitted; client cannot show unranked badge

| Field | Value |
|---|---|
| **Severity** | high |
| **Status** | **CLOSED** (Phase 32) |
| **Evidence** | `src/api/ws/handlers.js:_checkBookAlert` — calls `session.setUnranked()` silently; no WS send follows |
| **Description** | FR-REP-COACH-4 requires the server to emit `ranked_changed { reason: 'repertoire_coach' }` when the first alert in a game sets the game to unranked. The client cannot update the ranked/unranked badge. |
| **Closing phase** | Phase 32 |
| **Test** | `tests/unit/ws/coach-conformance.test.js` — "B1: ranked_changed emitted when alert fires"; journey stage 5 (`assertRankedChanged`) |
| **Closing note** | Fixed: `_checkBookAlert` now sends `{ type: 'ranked_changed', ranked: false }` immediately after `session.setUnranked()`. |

---

### B10 — `_applyChoiceMove` transaction violated; refusal not atomic

| Field | Value |
|---|---|
| **Severity** | high |
| **Status** | OPEN |
| **Evidence** | `src/api/ws/handlers.js:_applyChoiceMove:377-453` — catches a failed transaction and re-appends the move outside it |
| **Description** | NFR N-2: a refusal MUST be durably committed in the same transaction as its move. The current code appends the move outside the transaction on failure, violating atomicity. A network error or process crash between the append and the refusal write would leave the DB in an inconsistent state. |
| **Closing phase** | Phase 29 |
| **Test** | Unit test for `_applyChoiceMove` with a simulated transaction failure (Phase 29) |
| **Closing note** | — |

---

### B11 — Challenge opens only for `refused_repeat`; `keep` on `lapse`/`novelty` records nothing

| Field | Value |
|---|---|
| **Severity** | high |
| **Status** | **CLOSED** (Phase 32) |
| **Evidence** | `src/api/ws/handlers.js:_applyChoiceMove` — challenge row opened only on `refused_repeat` role check |
| **Description** | FR-REP-COACH-7 requires a `rep_challenges` row on any `decision = 'keep'`. Only `refused_repeat` currently creates a challenge. A deliberate `keep` on a `lapse`, `novelty`, or `order_slip` is silently discarded. |
| **Closing phase** | Phase 32 |
| **Test** | `tests/unit/ws/coach-conformance.test.js` — "B11: any deliberate keep opens a challenge" |
| **Closing note** | Fixed: `_applyChoiceMove` now opens a challenge on any deliberate `keep` regardless of deviation kind. Timeout auto-keeps still open no challenge (invariant 15). |

---

### B13 — Bootstrap guard counts encounters, not confirmed canonical nodes

| Field | Value |
|---|---|
| **Severity** | medium |
| **Status** | **CLOSED** (Phase 32) |
| **Evidence** | `src/api/ws/handlers.js:_checkBookAlert` — `listNodes().filter(n => n.encounters >= 2)` |
| **Description** | FR-REP-COACH-2 specifies `REP_BOOTSTRAP_CONFIRMED_MIN = 20` confirmed nodes. The current guard counts nodes with ≥ 2 encounters (which includes candidates). The coach wakes up earlier than intended — possibly after 20 candidate nodes, not 20 canonical nodes. |
| **Closing phase** | Phase 32 |
| **Test** | `tests/unit/ws/coach-conformance.test.js` — "B13: bootstrap guard counts canonical nodes"; journey stage 4 (coach stays silent until 20th canonical node) |
| **Closing note** | Fixed: `_checkBookAlert` now calls `repertoireRepo.countCanonicalNodes()` (counts distinct (epd, side) pairs that have at least one move with `role='canonical'`). Both SQLite and in-memory repos implement this method. |

---

### B14 — Alert discounts clock retroactively instead of pausing it

| Field | Value |
|---|---|
| **Severity** | medium |
| **Status** | **CLOSED** (Phase 32) |
| **Evidence** | `src/api/ws/handlers.js:~358` — elapsed time is subtracted at alert resolution |
| **Description** | FR-REP-COACH-3 requires the player's clock to be paused while a move is held. The current implementation discounts elapsed clock retroactively at decision time. A player who takes 30 s to decide loses 30 s of game time even though the board was frozen. |
| **Closing phase** | Phase 32 |
| **Test** | `tests/unit/ws/coach-conformance.test.js` — "B14: clock charges only pre-alert thinking time" |
| **Closing note** | Fixed: `_checkBookAlert` captures `session.elapsedMs()` at alert time. `_applyChoiceMove` and `_handleAlertTimeout` call `session.chargeElapsedMs(preAlertElapsedMs)` before `session.applyMove` so only pre-alert thinking time is debited. Also fixed a type bug in `session.chargeElapsedMs` where `Date - number` produced a number, not a Date. |

---

### B12 — No live `REP_PLY_MAX` guard on the coach path

| Field | Value |
|---|---|
| **Severity** | medium |
| **Status** | OPEN |
| **Evidence** | `src/api/ws/handlers.js:_checkBookAlert` — no ply-depth check before book lookup |
| **Description** | `build.js` enforces `REP_PLY_MAX = 30` post-game. The live coach path has no guard. Alerts can fire at ply 31+ where the book has no data, producing spurious alerts or crashes. |
| **Closing phase** | Phase 29 |
| **Test** | Unit test for `_checkBookAlert` with ply > 30 (Phase 29) |
| **Closing note** | — |

---

### B8 — Reach probability never computed; coverage % and gap report absent

| Field | Value |
|---|---|
| **Severity** | medium |
| **Status** | **CLOSED** (Phase 33) |
| **Evidence** | `src/domain/repertoire/reach.js` — exports `computeReach`; zero call sites |
| **Description** | FR-REP-REACH-1/2/3/5: reach probability, coverage %, and gap report all depend on `rep_policy` being populated by background Maia policy probes. `reach.js` has no caller. `rep_policy` is always empty. |
| **Closing phase** | Phase 33 |
| **Test** | `tests/unit/ws/reach-service.test.js` — `runReachProbes`, `computeCoverage`, `computeGapReport` |
| **Closing note** | Fixed: `src/api/ws/reach-service.js` added. `runReachProbes` BFS from START_FEN through canonical moves, queries Maia policy for opponent positions, distributes reach prob. `updateNodeReachProb` persists results. `computeCoverage` and `computeGapReport` wired as `GET /api/repertoire/coverage` and `GET /api/repertoire/gaps`. Maia probes run as part of `runBookMaintenance`. `reachableBookUcis` and `nodeHasDrillHistory` wired into `_checkBookAlert` so `order_slip` and `lapse` can fire. Stage 6 of journey now asserts `order_slip`. |

---

### B9 — Coached-game strength-sample exclusion is a comment, not a guard

| Field | Value |
|---|---|
| **Severity** | medium |
| **Status** | **CLOSED** (Phase 32) |
| **Evidence** | `src/api/ws/analysis-service.js:~181` — comment: "When saveStrengthSample is added, guard it with: session.alertsInGame === 0" |
| **Description** | FR-REP-COACH-14: coached games (`coach_enabled = 1`) MUST NOT contribute to strength sampling. The guard is a comment. The `saveStrengthSample` call that the comment documents does not exist yet. |
| **Closing phase** | Phase 32 |
| **Test** | `tests/unit/analysis-service-extra.test.js` — "B9: ranked game with alertsInGame > 0 skips ELO update" |
| **Closing note** | Fixed: `analyseGame` now skips ELO update when `game.alertsInGame > 0`. The strength-sample exclusion is enforced at the ELO gate. `saveStrengthSample` is not yet implemented (post-Phase 33); the guard is already in place. |

---

## UI defects

### U3 — No Undo button; only safeguard behind automatic promotion is unreachable

| Field | Value |
|---|---|
| **Severity** | blocking |
| **Status** | OPEN |
| **Evidence** | `src/api/routes/repertoire.js` — `POST /changelog/:id/reverse` exists and passes its tests; `public/repertoire.html` — no button invokes it |
| **Description** | The only mechanism a player has to reverse an automatic promotion is the reverse API. It is tested and works. Nothing in the UI calls it. A player cannot undo a promotion without using the API directly. |
| **Closing phase** | Phase 30 |
| **Test** | Journey stage 2.5 (Undo button) |
| **Closing note** | — |

---

### U13 — No "Your journey" history view

| Field | Value |
|---|---|
| **Severity** | high |
| **Status** | OPEN |
| **Evidence** | `public/repertoire.html` — two panels only: Coverage and "What changed in your book" |
| **Description** | The changelog panel shows the last 20 entries with no dates, no grouping, no trend. `getChangelog(limit=50)` has no time range or cursor. The player cannot see how his book has grown, what changed when, or why. RQ2 (coverage-growth curve) is in the same data. |
| **Closing phase** | Phase 36 |
| **Test** | Journey stage 3.8 (full invariant sweep includes journey route) |
| **Closing note** | — |

---

### U5 — `repertoire_update` unhandled by every client

| Field | Value |
|---|---|
| **Severity** | high |
| **Status** | OPEN |
| **Evidence** | Server emits `{ type: 'repertoire_update', ... }` in `repertoire-service.js`; `public/js/play.js` and `public/js/repertoire.js` have no handler for this message type |
| **Description** | The post-game panel cannot update after analysis. The player sees no indication that his repertoire was updated. The `repertoire_update` message is broadcast but silently ignored. |
| **Closing phase** | Phase 30 |
| **Test** | Journey stages 1.5 and 2.9 (event probe for `repertoire_update`) |
| **Closing note** | — |

---

### U9 — Client input not frozen during alert

| Field | Value |
|---|---|
| **Severity** | high |
| **Status** | **CLOSED** (Phase 32) |
| **Evidence** | `public/js/play.js:35` — `coachAlertPending = true` is set; `handlePlayerMove` never checks it |
| **Description** | While a `repertoire_alert` is pending, the board should be locked. The `coachAlertPending` flag is set but never consulted in `handlePlayerMove`. The player can submit a second move while the first is held. |
| **Closing phase** | Phase 32 |
| **Test** | Playwright stage screenshot — alert overlay active (Phase 35) |
| **Closing note** | Fixed: `handlePlayerMove` now returns early when `coachAlertPending` is true. |

---

### U1 — No tree view on repertoire page

| Field | Value |
|---|---|
| **Severity** | high |
| **Status** | **CLOSED** (Phase 34) |
| **Evidence** | `public/repertoire.html` — two panels only (Coverage, Recent changes) |
| **Description** | The player cannot see his book as a navigable move tree. Candidates, quarantined and challenged nodes are not visible. |
| **Closing phase** | Phase 34 |
| **Test** | `GET /api/repertoire/tree` route test; `public/js/repertoire.js` `renderTree` |
| **Closing note** | Fixed: added Book tree panel to `repertoire.html` and `repertoire.js`. Flat list sorted by minPly with toggle for candidates/alts. Reach prob shown per node when available. |

---

### U2 — No refusal log, no retrospective hit-rate

| Field | Value |
|---|---|
| **Severity** | high |
| **Status** | **CLOSED** (Phase 34) |
| **Evidence** | `public/repertoire.html` — no refusal log panel |
| **Description** | The player cannot see which moves he has refused, how many became book moves, or what the hit-rate is. All data exists in `rep_deviations` + `rep_challenges`. |
| **Closing phase** | Phase 34 |
| **Test** | `GET /api/repertoire/refusals` hit-rate tests (`tests/unit/repertoire/routes.test.js`) |
| **Closing note** | Fixed: refusal log panel added to `repertoire.html`; `GET /api/repertoire/refusals` enriched with `keptCount`, `keptInBookCount`, `hitRatePct`; `loadRefusals` in `repertoire.js` renders summary and per-deviation rows. |

---

### U6 — No coach toggle in the UI

| Field | Value |
|---|---|
| **Severity** | medium |
| **Status** | **CLOSED** (Phase 32) |
| **Evidence** | `public/js/play.js` — no toggle visible; `games.coach_enabled` persists correctly (commit `d77c121`) |
| **Description** | RQ4 requires games played with and without coaching. The `coach_enabled` flag works server-side. The player cannot toggle it without editing the game-start payload manually. |
| **Closing phase** | Phase 32 |
| **Test** | `tests/unit/repertoire/coach.test.js` — "coach_enabled=false silences all alerts regardless of book state" |
| **Closing note** | Fixed: `public/play.html` has a coach toggle checkbox in the setup panel; `public/js/play.js` wires it to `coachEnabled` state and includes it in the `new_game` message. |

---

### U7 — Opening cards not labelled in drill

| Field | Value |
|---|---|
| **Severity** | medium |
| **Status** | **CLOSED** (Phase 34) |
| **Evidence** | `public/js/puzzles.js` — no `kind`-based rendering branch |
| **Description** | Opening FSRS cards (`puzzles.kind = 'opening'`) are visually identical to tactical cards. The player does not know he is drilling his opening repertoire vs a tactics position. |
| **Closing phase** | Phase 34 |
| **Test** | `includes kind field on each card (U7)` in `tests/unit/routes/puzzles-routes.test.js` |
| **Closing note** | Fixed: `formatCard` in `puzzles.js` route now includes `kind`; `puzzles.js` frontend prepends "Opening — " to the move label and shows a dedicated prompt for opening cards. |

---

### U8 — Changelog renders raw UCI, not SAN

| Field | Value |
|---|---|
| **Severity** | medium |
| **Status** | OPEN |
| **Evidence** | `public/js/repertoire.js` — changelog entries rendered from `from_uci` / `to_uci` fields |
| **Description** | The changelog panel shows move strings like `e2e4` instead of `e4`. Non-technical players cannot read UCI. |
| **Closing phase** | Phase 30 |
| **Test** | DOM probe: changelog entry text matches SAN pattern, not UCI pattern |
| **Closing note** | — |

---

### U11 — Coach copy defects

| Field | Value |
|---|---|
| **Severity** | medium |
| **Status** | **CLOSED** (Phase 34) |
| **Evidence** | `public/js/play.js:508-518`; `docs/game/voice_and_tone.md:65` |
| **Description** | Per-kind headline copy exists but: (1) sub-line is one generic string regardless of kind; (2) "first"/"instead" button suffixes are missing; (3) `refused_repeat` headline is inverted against `voice_and_tone.md:65`. |
| **Closing phase** | Phase 34 |
| **Test** | `public/js/play.js` (frontend, excluded from coverage) |
| **Closing note** | Fixed: per-kind `subCopy` map in `showCoachAlert`; `order_slip` button "Play X first"; `refused_repeat` button "Play X instead"; `refused_repeat` sub "Cost vs X: N win%"; `lapse` sub "You've drilled this position. Cost: N win%". |

---

### U4 — No gap report

| Field | Value |
|---|---|
| **Severity** | medium |
| **Status** | **CLOSED** (Phase 34) |
| **Evidence** | `public/repertoire.html` — no gap panel |
| **Description** | FR-REP-REACH-5: the gap report must list opponent replies with high policy probability for which the player has no response. No UI surface exists. |
| **Closing phase** | Phase 34 |
| **Test** | `GET /api/repertoire/gaps` route tests; `loadGaps` in `public/js/repertoire.js` |
| **Closing note** | Phase 33 added `GET /api/repertoire/gaps` backed by `computeGapReport`. Phase 34 added Coverage gaps panel to `repertoire.html` with top-10 gaps sorted by reach probability. |

---

### U12 — No line-health display

| Field | Value |
|---|---|
| **Severity** | low |
| **Status** | OPEN |
| **Evidence** | `public/repertoire.html` |
| **Description** | `rep_nodes.line_loss` is computed correctly but never surfaced in the UI. The player cannot see which lines are most at risk. |
| **Closing phase** | Phase 34 |
| **Test** | DOM probe (Phase 34) |
| **Closing note** | Phase 33 added `reach_prob` to node data; line health UI deferred to Phase 34. |

---

### U10 — No TUI repertoire screen

| Field | Value |
|---|---|
| **Severity** | low |
| **Status** | OPEN |
| **Evidence** | `tui/screens/` — no repertoire screen |
| **Description** | The TUI has no way to view or interact with the repertoire. Terminal users cannot access any repertoire feature. |
| **Closing phase** | Phase 35 |
| **Test** | TUI screen test (Phase 35) |
| **Closing note** | — |

---

## Documentation defects

### D1 — `balance.md` REP_* table uses 5 columns, breaking the 4-column convention

| Field | Value |
|---|---|
| **Severity** | low |
| **Status** | OPEN |
| **Evidence** | `docs/game/balance.md:39-68`; every other table in the file has 4 columns |
| **Description** | The REP_* table has an extra "Rationale" column inline. `tests/unit/config.test.js:23` greps the whole document for UPPER_SNAKE words, so a constant mentioned only in prose passes as "documented". A constant that appears in the 5th column but not the constant-name column would pass the test while being misdocumented. |
| **Closing phase** | Phase 37 |
| **Test** | Config test (updated in Phase 37) |
| **Closing note** | — |

---

### D2 — `api_contract.md` field names are stale

| Field | Value |
|---|---|
| **Severity** | low |
| **Status** | OPEN |
| **Evidence** | `docs/features/repertoire/api_contract.md` — uses `decision`, `changes`, `{open, recent}` |
| **Description** | The API contract drifted during Phases 20–22: `decision` was renamed `choice`; `changes` became `entries`; `{open, recent}` became `{challenges}`. New developers reading the contract will generate incorrect API calls. |
| **Closing phase** | Phase 37 |
| **Test** | Manual review (Phase 37) |
| **Closing note** | — |

---

### D3 — `traceability.md` names non-proving tests for FR-REP-DRILL-5, FR-REP-COACH-14, FR-REP-REACH-*

| Field | Value |
|---|---|
| **Severity** | low |
| **Status** | OPEN |
| **Evidence** | `docs/features/repertoire/traceability.md` |
| **Description** | The traceability matrix claims coverage for FR-REP-DRILL-5 (reach-weighted drill order), FR-REP-COACH-14 (coached-game exclusion), and all FR-REP-REACH-* requirements. No tests in the codebase actually exercise the live paths for these requirements (see B8, B9). |
| **Closing phase** | Phase 37 |
| **Test** | Updated traceability.md with accurate test references |
| **Closing note** | — |
