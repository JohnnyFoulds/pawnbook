# Traceability matrix — auto-repertoire

**Status:** Phase 36 complete — 2026-08-30; U13 closed  
All `FR-REP-*` codes from `feature_spec.md`.

| Requirement | Test(s) | File(s) |
|---|---|---|
| FR-REP-BOOK-1 | `epd: extractEpd returns first four FEN fields only` | `src/domain/repertoire/epd.js` |
| FR-REP-BOOK-2 | `epd: representative FEN round-trips` | `src/domain/repertoire/epd.js` |
| FR-REP-BOOK-3 | `state: exactly one role per move` | `src/domain/repertoire/state.js` |
| FR-REP-BOOK-4 | invariant 1 test | `src/domain/repertoire/state.js` |
| FR-REP-BOOK-5 | `deviation: in_book_canonical → silent` | `src/domain/repertoire/deviation.js` |
| FR-REP-BOOK-6 | `deviation: refused_repeat → alert` | `src/domain/repertoire/deviation.js` |
| FR-REP-BOOK-7 | `deviation: candidate treated as new_territory` | `src/domain/repertoire/deviation.js` |
| FR-REP-BOOK-8 | `epd: two positions same EPD via different orders` | `src/domain/repertoire/epd.js` |
| FR-REP-LEARN-1 | `build: new observation produces candidate` | `src/domain/repertoire/build.js` |
| FR-REP-LEARN-2 | regression test 4 | `src/domain/repertoire/build.js` |
| FR-REP-LEARN-3 | `state: candidate on first observation; never canonical from single observation` | `src/domain/repertoire/state.js` |
| FR-REP-LEARN-4 | `state: candidate → canonical after REP_CONFIRM_OBS` | `src/domain/repertoire/state.js` |
| FR-REP-LEARN-5 | `vote: canonical is highest recency-weighted score` | `src/domain/repertoire/vote.js` |
| FR-REP-LEARN-6 | `vote: alternation → settle as canonical + alt` | `src/domain/repertoire/vote.js` |
| FR-REP-LEARN-7 | `state: canonical → retired when vote overtaken` | `src/domain/repertoire/state.js` |
| FR-REP-LEARN-8 | `state: quarantine exit clean→alt worse→refused` | `src/domain/repertoire/state.js` |
| FR-REP-LEARN-9 | regression test 7 | `src/domain/repertoire/state.js` |
| FR-REP-LEARN-10 | regression test 8 | `src/domain/repertoire/deviation.js`, `handleMove` |
| FR-REP-GATE-1 | `gates: boundary tests (< 10, exactly 10, exactly 20, ≥ 20)` | `src/domain/repertoire/gates.js` |
| FR-REP-GATE-2 | `gates: absolute floor skipped when unreachable` | `src/domain/repertoire/gates.js` |
| FR-REP-GATE-3 | `gates: cumulative budget; regression test 6` | `src/domain/repertoire/gates.js` |
| FR-REP-GATE-4 | `gates: forced mate → refused` | `src/domain/repertoire/gates.js` |
| FR-REP-GATE-5 | invariant 8 test | `src/domain/repertoire/gates.js`, `rep_audits` DDL |
| FR-REP-COACH-1 | `handleMove: move held when alert triggered` | `src/api/ws/handlers.js` |
| FR-REP-COACH-2 | `handleMove: alert triggered when in alerting set + in budget` | `src/api/ws/handlers.js` |
| FR-REP-COACH-3 | `handleMove: clock paused during hold` | `src/api/ws/handlers.js` |
| FR-REP-COACH-4 | `handleMove: ranked flip on first alert` | `src/api/ws/handlers.js` |
| FR-REP-COACH-5 | no-classification test | `src/schemas/messages.js` |
| FR-REP-COACH-6 | `handleMove: decision=correct applies book move` | `src/api/ws/handlers.js` |
| FR-REP-COACH-7 | `handleMove: decision=keep opens challenge in same transaction` | `src/api/ws/handlers.js` |
| FR-REP-COACH-8 | regression test 3 (timeout) | `src/api/ws/handlers.js` |
| FR-REP-COACH-9 | regression test 3 (post_game) | `src/api/ws/handlers.js` |
| FR-REP-COACH-10 | NFR live-path engine test | `src/api/ws/handlers.js` |
| FR-REP-COACH-11 | `handleMove: repertoire error swallowed; move proceeds` | `src/api/ws/handlers.js` |
| FR-REP-COACH-12 | `handleMove: repertoireRepo injected not singleton` | `src/api/ws/handlers.js` |
| FR-REP-COACH-13 | `handleMove: coach_enabled=0 no alert` | `src/api/ws/handlers.js` |
| FR-REP-COACH-14 | `analysis-service: saveStrengthSample guarded` | `src/api/ws/analysis-service.js` |
| FR-REP-CHAL-1 | `handleMove: rep_challenges row committed with move` | `src/api/ws/handlers.js` |
| FR-REP-CHAL-2 | `challenge: neither move alerts while open` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-3 | regression test 1 | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-4 rule 1 | `challenge: gate veto beats good results` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-4 rule 2 | `challenge: engine-clear promotes` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-4 rule 3 | `challenge: repeat-plus-neutral promotes` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-4 rule 4 | `challenge: evidence promotes` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-4 rule 5 | `challenge: style-call promotes not escalated` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-4 rule 6 | `challenge: incumbent replayed → rejected` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-4 rule 7 | `challenge: abandoned at TTL encounters` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-4 rule 8 | `challenge: neither move alerts while open` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-4 rule 9 | `challenge: alternation → settled_both` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-5 | `challenge: engine_delta sign test` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-6 | `challenge: Elo-adjusted performance formula` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-7 | `challenge: promotion writes retired + canonical + changelog` | `src/domain/repertoire/challenge.js` |
| FR-REP-CHAL-8 | regression test 5 | `src/domain/repertoire/challenge.js`, `src/api/routes/repertoire.js` |
| FR-REP-REACH-1 | `reach: reach_prob formula` | `src/domain/repertoire/reach.js` |
| FR-REP-REACH-2 | `reach: cached per (epd, weights_id)` | `src/adapters/sqlite/repositories.js` |
| FR-REP-REACH-3 | `coverage: coverage_pct formula` | `src/domain/repertoire/reach.js` |
| FR-REP-REACH-4 | `coverage: expected_depth weighted` | `src/domain/repertoire/reach.js` |
| FR-REP-REACH-5 | `gap: returns replies above threshold` | `src/domain/repertoire/reach.js` |
| FR-REP-REACH-6 | `reach: frontier threshold` | `src/domain/repertoire/reach.js` |
| FR-REP-DRILL-1 | `drill: canonical confirmation writes puzzle + fsrs_cards` | `src/domain/repertoire/build.js` |
| FR-REP-DRILL-2 | `drill: accepted_moves_json canonical+alts+challenger` | `src/domain/repertoire/build.js` |
| FR-REP-DRILL-3 | `drill: opening cards exempt from FINDABILITY_MIN` (×3 files) | `src/domain/puzzles/select.js`, `src/domain/review/queue.js`, `src/domain/review/rating.js` |
| FR-REP-DRILL-4 | schema migration test | `src/adapters/sqlite/schema.js` |
| FR-REP-DRILL-5 | `drill: due cards sorted by reach descending` | `src/domain/review/queue.js` |
| FR-REP-STORE-1 | invariant 3 test | `src/adapters/sqlite/repositories.js` |
| FR-REP-STORE-2 | invariants 11, 12 tests | `src/adapters/sqlite/repositories.js` |
| FR-REP-STORE-3 | rebuild determinism test | `scripts/seed-repertoire.js` |
| FR-REP-STORE-4 | `seed-script: two consecutive rebuilds byte-identical` | `scripts/seed-repertoire.js` |
| FR-REP-STORE-5 | invariant 12 test | `src/adapters/sqlite/repositories.js` |
| FR-REP-STORE-6 | invariant 13 test | `scripts/export-research-dataset.js` |
| FR-REP-STORE-7 | `schema: games.coach_enabled column exists` | `src/adapters/sqlite/schema.js` |
| FR-REP-API-1 | route tests (×6) | `src/api/routes/repertoire.js` |
| FR-REP-API-2 | WS handler tests | `src/api/ws/handlers.js`, `src/schemas/messages.js` |
| FR-REP-API-3 | no-classification test | `src/schemas/messages.js` |
| FR-REP-API-4 | integration: routes reachable via server | `src/server.js` |

## Phase 27–28 additions

| Requirement | Test name | File |
|---|---|---|
| B15 fix: `getEvals` returns snake_case from both repos | `normaliseMoveEval: getEvals shape` | `tests/unit/adapters/phase-27-adapters.test.js` |
| ManualTimer fires registered callbacks | `ManualTimer fires all` | `tests/unit/adapters/phase-27-adapters.test.js` |
| SequentialIds never repeats | `SequentialIds: unique` | `tests/unit/adapters/phase-27-adapters.test.js` |
| FakeEnginePool returns valid evals | `FakeEnginePool: eval shape` | `tests/unit/adapters/phase-27-adapters.test.js` |
| Journey harness: Stage 1 candidates created | `Stage 1: First candidates (days 1-2)` | `tests/journey/repertoire-v1.test.js` |
| Journey harness: Stage 3 bootstrap silence | `Stage 3: Bootstrap silence (days 5-8)` | `tests/journey/repertoire-v1.test.js` |
| Journey harness: structural invariants hold | `final: all structural invariants pass` | `tests/journey/repertoire-v1.test.js` |


## Phase 29–30 additions

| Requirement | Test name | File |
|---|---|---|
| B3: `electCanonical` caller exists | `switches canonical to more recently played move` | `tests/unit/ws/maintenance-service.test.js` |
| B4: `candidateExpired` caller exists | `expires candidate at TTL encounters → retired` | `tests/unit/ws/maintenance-service.test.js` |
| B5: `reAuditQuarantined` caller exists | `promotes quarantined move to alt when mean win loss improves` | `tests/unit/ws/maintenance-service.test.js` |
| Invariant 16: maintenance idempotence | `running twice produces no second changelog entry` | `tests/unit/ws/maintenance-service.test.js` |
| B12: `REP_PLY_MAX` guard on coach path | wired via balance import in `_checkBookAlert` | `src/api/ws/handlers.js` |
| B10: refusal committed with move or not at all | catch block returns without re-applying | `src/api/ws/handlers.js` |
| U8: changelog renders SAN | `enriches entries with fromSan/toSan SAN fields` | `tests/unit/repertoire/routes.test.js` |
| U3: Reverse button reachable | render test + reverse route coverage | `public/js/repertoire.js`, `src/api/routes/repertoire.js` |
| U5: `repertoire_update` handled in clients | play.js handler + repertoire.js WS listener | `public/js/play.js`, `public/js/repertoire.js` |

## Phase 31 additions

| Requirement | Test name | File |
|---|---|---|
| B6: `rep_audits` rows written per challenge | `writes two audit rows — one per move` | `tests/unit/ws/audit-service.test.js` |
| B7: `engineDeltaWinPts` computed and persisted | `writes engineDeltaWinPts to the challenge row` | `tests/unit/ws/audit-service.test.js` |
| B7: `gateVerdict` computed and persisted | `writes gateVerdict to the challenge row` | `tests/unit/ws/audit-service.test.js` |
| B7: null delta when engine returns null cp | `writes engineDelta null when engine returns cp: null, mate: null` | `tests/unit/ws/audit-service.test.js` |
| B7: trend at +[2,4,6] plies | `populates trendChallenger when game evals exist at trend plies` | `tests/unit/ws/audit-service.test.js` |
| B7: result performance — challenger | `computes resultChallengerPerf from finished games` | `tests/unit/ws/audit-service.test.js` |
| B7: result performance — incumbent | `computes resultIncumbentPerf from incumbent games` | `tests/unit/ws/audit-service.test.js` |
| B7: draw result perf | `draw result produces a non-null perf between 0 and 1` | `tests/unit/ws/audit-service.test.js` |
| Audit error swallowing | `swallows errors and returns without throwing` | `tests/unit/ws/audit-service.test.js` |
| Gate verdict error catch | `gateVerdict falls back to null when position eval throws` | `tests/unit/ws/audit-service.test.js` |
| Trend/result error catches | `swallows errors from getObservationsForNode` | `tests/unit/ws/audit-service.test.js` |
| `REP_AUTO_PROMOTE` kill switch | `balance: every parameter in balance.js is documented` | `tests/unit/config.test.js` |

## Phase 32 additions

| Requirement | Test name | File |
|---|---|---|
| B2: `classifyDeviation` called on every deviant move | `deviant move at a node with canonical fires repertoire_alert with a kind` | `tests/unit/ws/coach-conformance.test.js` |
| B2: `refused_repeat` kind fires for refused role | `refused move fires refused_repeat kind` | `tests/unit/ws/coach-conformance.test.js` |
| B1: `ranked_changed` emitted on alert | `emits ranked_changed when a ranked game triggers a coach alert` | `tests/unit/ws/coach-conformance.test.js` |
| B1: no `ranked_changed` when coach disabled | `does not emit ranked_changed when coach is disabled` | `tests/unit/ws/coach-conformance.test.js` |
| B11: explicit keep opens challenge | `sending repertoire_choice keep opens a challenge` | `tests/unit/ws/coach-conformance.test.js` |
| B11: timeout auto-keep opens no challenge | `timed-out alert (auto-keep) does NOT open a challenge` | `tests/unit/ws/coach-conformance.test.js` |
| B13: bootstrap counts canonical nodes | `no alert fires when canonical node count is below REP_BOOTSTRAP_CONFIRMED_MIN` | `tests/unit/ws/coach-conformance.test.js` |
| B13: alert fires at threshold | `alert fires when canonical node count reaches REP_BOOTSTRAP_CONFIRMED_MIN` | `tests/unit/ws/coach-conformance.test.js` |
| B14: keep path charges pre-alert time only | `keep path completes without error (chargeElapsedMs is called)` | `tests/unit/ws/coach-conformance.test.js` |
| B14: timeout path charges pre-alert time only | `timeout path completes without error (chargeElapsedMs is called on timeout)` | `tests/unit/ws/coach-conformance.test.js` |
| B9: coached game skips ELO update | `B9: ranked game with alertsInGame > 0 skips ELO update` | `tests/unit/analysis-service-extra.test.js` |
| B9: uncoached game still updates ELO | `B9: ranked game with alertsInGame = 0 still updates ELO` | `tests/unit/analysis-service-extra.test.js` |
| U6: coach toggle silences alerts | `coach_enabled=false silences all alerts regardless of book state` | `tests/unit/repertoire/coach.test.js` |
| Journey stage 4: bootstrap silence until 20 nodes | stage4_bootstrapWakes passes | `tests/journey/repertoire-v1.test.js` |
| Journey stage 5: first alert + ranked_changed | stage5_firstAlert passes + assertRankedChanged | `tests/journey/repertoire-v1.test.js` |
| Journey stage 6: alert fires for deviant move | stage6_orderSlip passes | `tests/journey/repertoire-v1.test.js` |

## Phase 33 additions

| Requirement | Test name | File |
|---|---|---|
| B8: `runReachProbes` BFS coverage | `probes root node even with no canonical move` | `tests/unit/ws/reach-service.test.js` |
| B8: BFS skips START_FEN not in book (line 73) | `handles starting position not in book` | `tests/unit/ws/reach-service.test.js` |
| B8: BFS skips opposing-side nodes (line 178) | `skips nodes from the opposing side` | `tests/unit/ws/reach-service.test.js` |
| B8: Maia policy prob used when defined | `uses Maia policy probabilities when available` | `tests/unit/ws/reach-service.test.js` |
| B8: policy throws → uniform fallback | `continues BFS when policy() throws` | `tests/unit/ws/reach-service.test.js` |
| B8: `updateNodeReachProb` errors swallowed | `swallows updateNodeReachProb errors` | `tests/unit/ws/reach-service.test.js` |
| B8: `computeCoverage` returns all fields | `counts canonical moves as covered` | `tests/unit/ws/reach-service.test.js` |
| B8: `computeCoverage` reach-weighted | `uses reach_prob for weighted coverage` | `tests/unit/ws/reach-service.test.js` |
| B8: `computeGapReport` returns gap candidates | `returns gap candidates for opponent replies not in book` | `tests/unit/ws/reach-service.test.js` |
| B8: gap report excludes covered replies | `excludes opponent replies that are already in the book` | `tests/unit/ws/reach-service.test.js` |
| `GET /coverage` returns rich coverage shape | `GET /coverage returns coverage object` | `tests/unit/repertoire/routes.test.js` |
| `GET /gaps` returns gap array | `GET /gaps returns gap array` | `tests/unit/repertoire/routes.test.js` |
| `GET /gaps` 500 on repo error | `GET /gaps returns 500 when repo throws` | `tests/unit/repertoire/routes.test.js` |
| `hasDrilledCard` — opening puzzle with reps>0 | `hasDrilledCard returns true for opening puzzle with reps` | `tests/contract/repositories.test.js` |
| `hasDrilledCard` — no card → false | `hasDrilledCard returns false when no card exists` | `tests/contract/repositories.test.js` |
| `updateNodeReachProb` persists reach_prob | `updateNodeReachProb writes reach_prob and clears reachStale` | `tests/contract/repositories.test.js` |
| `runBookMaintenance` returns `reachProbed` | `swallows errors and returns zero counts` shape includes `reachProbed` | `tests/unit/ws/maintenance-service.test.js` |
| Journey stage 6: `order_slip` kind | `stage6_orderSlip: alert kind is order_slip` | `tests/journey/repertoire-v1.test.js` |

## Phase 34 additions

| Requirement | Test name | File |
|---|---|---|
| U1: tree view rendered in UI | `GET /api/repertoire/tree` route test | `tests/unit/repertoire/routes.test.js` |
| U2: refusal log with hit-rate | `includes keptCount, keptInBookCount and hitRatePct` | `tests/unit/repertoire/routes.test.js` |
| U2: hitRatePct null when no kept deviations | `hitRatePct is null when no kept deviations` | `tests/unit/repertoire/routes.test.js` |
| U2: skips kept deviation with unknown EPD | `skips kept deviation when EPD has no matching node` | `tests/unit/repertoire/routes.test.js` |
| U2: keptInBookCount 0 when move not canonical/alt | `keptInBookCount 0 when kept move is not canonical or alt` | `tests/unit/repertoire/routes.test.js` |
| U4: gap report panel in UI | `GET /api/repertoire/gaps returns gap array` | `tests/unit/repertoire/routes.test.js` |
| U7: `kind` field on drill cards | `includes kind field on each card (U7)` | `tests/unit/routes/puzzles-routes.test.js` |
| `/challenges` 500 error path | `returns 500 when repo throws` (challenges) | `tests/unit/repertoire/routes.test.js` |
| `POST /changelog/:id/reverse` 500 error path | `returns 500 when repo throws during reverse` | `tests/unit/repertoire/routes.test.js` |

## Phase 35 additions

| Requirement | Test name | File |
|---|---|---|
| U10: `createRepertoireScreen` exists and exports correctly | `tui/screens/repertoire.js exists and exports createRepertoireScreen` | `tests/unit/tui-phase10.test.js` |
| U10: fetches coverage endpoint | `repertoire screen fetches /api/repertoire/coverage` | `tests/unit/tui-phase10.test.js` |
| U10: fetches changelog endpoint | `repertoire screen fetches /api/repertoire/changelog` | `tests/unit/tui-phase10.test.js` |
| U10: fetches gaps endpoint | `repertoire screen fetches /api/repertoire/gaps` | `tests/unit/tui-phase10.test.js` |
| U10: renders coverage bar | `repertoire screen renders coverage bar` | `tests/unit/tui-phase10.test.js` |
| U10: shows error when API fails | `repertoire screen shows error when API fails` | `tests/unit/tui-phase10.test.js` |
| U10: renders gap entries | `repertoire screen renders gap entries` | `tests/unit/tui-phase10.test.js` |
| U10: `chess repertoire` subcommand wired | `bin/chess.js has repertoire subcommand` | `tests/unit/tui-phase10.test.js` |
| Playwright journey: 10-stage DOM suite | `tests/playwright/journey.spec.js` (10 stages) | `tests/playwright/journey.spec.js` |

## Phase 36 additions

| Requirement | Test name | File |
|---|---|---|
| FR-REP-JOURNEY-1: `GET /journey` returns timeline, growthSeries, milestones | `GET /api/repertoire/journey returns populated timeline and growthSeries` | `tests/unit/repertoire/routes.test.js` |
| FR-REP-JOURNEY-1: empty when no entries | `GET /api/repertoire/journey returns empty derived fields when no changelog entries` | `tests/unit/repertoire/routes.test.js` |
| FR-REP-JOURNEY-1: 500 on repo error | `returns 500 when repo throws` (journey) | `tests/unit/repertoire/routes.test.js` |
| FR-REP-JOURNEY-2: `buildTimeline` day buckets reverse-chron | `groups entries by date, reverse-chronological` | `tests/unit/repertoire/history.test.js` |
| FR-REP-JOURNEY-2: multiple entries same day | `groups multiple entries on the same day together` | `tests/unit/repertoire/history.test.js` |
| FR-REP-JOURNEY-3: `buildGrowthSeries` cumulative counts | `accumulates across multiple days` | `tests/unit/repertoire/history.test.js` |
| FR-REP-JOURNEY-3: `elect` counted as confirm | `counts elect as confirm` | `tests/unit/repertoire/history.test.js` |
| FR-REP-JOURNEY-4: `buildMilestones` firstConfirm, coachWoke at 20 | `sets coachWoke at the 20th confirm` | `tests/unit/repertoire/history.test.js` |
| FR-REP-JOURNEY-4: milestones null when not reached | `returns all-null for empty input` | `tests/unit/repertoire/history.test.js` |
| FR-REP-JOURNEY-5: `computeRq2` uses `buildGrowthSeries` | import of `buildGrowthSeries` in `scripts/repertoire-analysis.js` | `scripts/repertoire-analysis.js` |
| FR-REP-JOURNEY-6: `getChangelogRange` InMemory — all rows ascending | `getChangelogRange: returns all entries ascending when no filters` | `tests/unit/adapters/memory-repos-extra.test.js` |
| FR-REP-JOURNEY-6: `getChangelogRange` InMemory — from/to filter | `getChangelogRange: filters by from/to` | `tests/unit/adapters/memory-repos-extra.test.js` |
| FR-REP-JOURNEY-6: `getChangelogRange` InMemory — cursor | `getChangelogRange: cursor is exclusive lower bound` | `tests/unit/adapters/memory-repos-extra.test.js` |
| FR-REP-JOURNEY-6: `getChangelogRange` InMemory — limit | `getChangelogRange: respects limit` | `tests/unit/adapters/memory-repos-extra.test.js` |
| FR-REP-JOURNEY-6: `getChangelogRange` SQLite — ascending order | `returns all entries in ascending at order with no filters` | `tests/unit/ws/maintenance-service.test.js` |
| FR-REP-JOURNEY-6: `getChangelogRange` SQLite — from/to filter | `filters by from and to` | `tests/unit/ws/maintenance-service.test.js` |
| FR-REP-JOURNEY-6: `getChangelogRange` SQLite — cursor | `cursor acts as exclusive lower bound` | `tests/unit/ws/maintenance-service.test.js` |
| FR-REP-JOURNEY-6: `getChangelogRange` SQLite — limit | `respects limit` | `tests/unit/ws/maintenance-service.test.js` |
| U13: journey panel in `repertoire.html` | `#journey-milestones`, `#journey-growth`, `#journey-panel` elements present | `public/repertoire.html` |
