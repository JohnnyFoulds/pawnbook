# Traceability matrix — auto-repertoire

**Status:** Complete — all phases 17–26 landed; all FR-REP-* requirements covered  
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

