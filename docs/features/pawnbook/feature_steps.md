# Feature steps — pawnbook

Every test name below is written before implementation. Tests for future phases use `test.fails(...)` with `await import()` inside the body.

---

## Phase 0 — Spec (no code)

**Status:** Complete — 2026-08-26

**DoD:** §9 completeness checklist passes. Every FR is MUST/SHOULD/MAY, every error named with its code and HTTP status, every NFR has a measurable bound, every requirement in `initial_idea.md` either maps to a spec entry or is explicitly out of scope.

Exit gate: self-conducted production readiness review (`D1…Dn` findings resolved).

---

## Phase 1 — Scaffold, errors, config

**Status:** Complete — 2026-08-26

**Branch:** `feat/phase-1-scaffold`  
**Files:** `package.json`, `Makefile`, `vitest.config.js`, `eslint.config.js`, `src/errors.js`, `src/config.js`, `src/ports/*`, `.github/workflows/ci.yml`

```
errors: every error class extends PawnbookError
errors: ErrorCode is frozen and every class maps to exactly one code
errors: wrapping preserves cause chain
config: missing required env throws with the variable named
config: BIND_ADDR defaults to 127.0.0.1
config: a non-loopback BIND_ADDR logs a warn naming the address
coverage: the exclusion list matches the one documented in feature_spec.md
```

**DoD:** `make verify` green; CI passes; coverage gate armed.

---

## Phase 2 — Domain: grading and Elo

**Status:** Complete — 2026-08-26

**Branch:** `feat/phase-2-grading`  
**Files:** `src/domain/analysis/grade.js`, `src/domain/game/elo.js`, `src/domain/analysis/findability.js`, `src/shared/balance.js`

```
grade: winningChances(0) === 0
grade: winningChances is monotone increasing and clamps at ±1
grade: cp is clamped to ±1000 before conversion
grade: mate score maps to ±1000
grade: winLoss of 30 win% POINTS classifies Blunder
grade: winLoss of 20 win% POINTS classifies Mistake
grade: winLoss of 10 win% POINTS classifies Inaccuracy
grade: a winLoss of 0.30 (the OLD unit) classifies as OK, not Blunder
grade: cpLoss 0 classifies Best; <25 Great; <50 Good; else OK
grade: moveAccuracy returns 100 when winAfter >= winBefore
grade: moveAccuracy is clamped to [1, 100]
grade: known lichess game reproduces published per-move accuracies (fixture)
grade: losing a forced mate is a Blunder
grade: missing a forced mate below -700cp downgrades to Mistake
grade: White's first move uses the synthetic +0.15 prior eval
grade: game accuracy is the mean of harmonic and volatility-weighted means
elo: expected score is 0.5 for equal ratings
elo: hand-computed win at K=20 matches
elo: K is 40 under 15 games, 20 under 2100, else 10
elo: a draw between equal ratings leaves the rating unchanged
elo: score outside {0, 0.5, 1} throws
elo: a rating difference beyond ±400 is clamped before expected()
elo: losing to sf-max at 1200 costs a non-trivial number of points
elo: an opponent with a null rating cannot produce a ranked game
phase: a queenless position on ply 28 is endgame, not middlegame
phase: a full-material position on ply 60 is middlegame, not endgame
phase: ply <= 20 with castling rights available is opening
balance: every parameter in config matches docs/game/balance.md
```

---

## Phase 3 — Persistence

**Status:** Complete — 2026-08-26

**Branch:** `feat/phase-3-persistence`  
**Files:** `src/adapters/sqlite/schema.js`, `src/adapters/sqlite/repositories.js`, `src/adapters/memory/repositories.js`, `src/adapters/clock/`

```
contract: [sqlite|memory] saving then loading a game round-trips every field
contract: [sqlite|memory] unknown game id raises GameNotFoundError naming the id
contract: [sqlite|memory] puzzle FEN is unique; re-inserting bumps times_seen
contract: [sqlite|memory] move_evals PK (game_id, ply) rejects duplicates
contract: [sqlite|memory] elo_history append is ordered by recorded_at
contract: [sqlite|memory] due-card query returns only cards with due <= clock.now()
contract: [sqlite|memory] game_moves round-trips a partial game for resume
contract: [sqlite|memory] an elo update writes elo_history and settings.elo atomically
contract: [sqlite|memory] activity rows use a 04:00 local day boundary
contract: [sqlite|memory] the streak is derived from activity, never stored
sqlite: schema is idempotent — applying it twice is a no-op
sqlite: analysis_state only accepts pending|running|done|failed
sqlite: games.status only accepts in_progress|finished|abandoned
sqlite: termination only accepts the eight enum values
sqlite: startup re-derives settings.elo and logs error when it disagrees
```

---

## Phase 4 — Engine client

**Status:** Complete — 2026-08-26

**Branch:** `feat/phase-4-engine`  
**Files:** `src/adapters/engine/uci-engine-client.js`, `src/adapters/engine/engine-pool.js`, `src/adapters/engine/scripted-engine-client.js`, `scripts/record-fixtures.sh`

```
uci: handshake sends uci then isready and resolves on readyok
uci: handshake exceeding 10 s raises EngineTimeoutError
uci: a non-existent binary raises EngineUnavailableError naming the path
uci: info lines parse into {depth, cp, mate, bestmove, pv}
uci: cp scores are normalised to White's POV regardless of side to move
uci: VerboseMoveStats lines parse into a policy map summing to ~1.0
uci: the 'info string node' summary line is discarded from the policy map
uci: the parsed policy map size equals the legal-move count (20 at startpos)
uci: policyhead mode returns a bestmove and no policy map
uci: a missing weights file raises WeightsMissingError naming the file
uci: socket close kills the child process
uci: ENGINE_MODE=native resolves binaries to the host paths, container to /usr/local/bin
roster: a missing REQUIRED weight throws WeightsMissingError naming the file
roster: a missing OPTIONAL weight logs warn once and drops the opponent
pool: the analysis queue serialises jobs — never two go commands in flight
pool: spawn retries 3 times with backoff, then raises
pool: IllegalMoveError is never retried
scripted: replays fixture output identically to the parsed real output
```

---

## Phase 5 — Game session and WS play

**Status:** Complete — 2026-08-26

**Branch:** `feat/phase-5-play`  
**Files:** `src/domain/game/session.js`, `src/domain/game/roster.js`, `src/api/ws/`, `src/api/routes/`, `src/api/error-middleware.js`, `src/schemas/`

```
session: an illegal move raises IllegalMoveError and does not advance the game
session: moving in a finished game raises GameAlreadyOverError
session: checkmate sets result and termination
session: stalemate against drawfish is scored as a draw by standard rules
session: legalMoves is returned as [{uci, san}]
session: a ranked game's hint request raises HintNotAllowedError
session: only ranked games write elo_history
session: a drawfish game is forced unranked and writes no elo_history
session: termination is one of the eight enum values for every ending
roster: every opponent id resolves to a binary and options
roster: an unknown opponent id is rejected before a game row is created
resume: moves are appended to game_moves as each is accepted
resume: resuming reconstructs the position from game_moves alone
resume: resuming a finished game raises GameNotResumableError
resume: an in_progress game never resumed is marked abandoned
clock: an untimed game emits no clock_update and stores NULL time_control
clock: the mover's remainder is debited by the elapsed FixedClock time
clock: the increment is added after the move is accepted, not before
clock: reaching zero ends the game with termination='timeout' and the opponent wins
clock: the engine is given movetime below its own remainder so it cannot flag
clock: the clock pauses on socket close and resumes on resume
clock: an invalid timeControl payload is rejected by Zod before a game exists
ws: a malformed payload returns validation_failed without creating a game
ws: a mid-stream engine failure emits {type:'error', error_code:...}
api: GameNotFoundError maps to 404 with {error_code, message, detail}
api: HintNotAllowedError maps to 403
api: GameNotResumableError maps to 409
api: an unexpected throw maps to 500 and is logged with the error attached
```

---

## Phase 6 — Analysis pipeline

**Status:** Complete — 2026-08-26

**Branch:** `feat/phase-6-analysis`  
**Files:** `src/domain/analysis/pipeline.js`

```
pipeline: N moves produces N+1 position evaluations
pipeline: each move's winBefore equals the previous position's winAfter
pipeline: BOTH sides' plies are graded, mover's-POV normalised
pipeline: opponent_accuracy is computed from the opponent's plies only
pipeline: puzzle candidates are drawn from the player's plies only
pipeline: progress events are emitted monotonically to total
pipeline: progress carries phase and a monotone overallPct across all 3 passes
pipeline: pass 2 re-runs only candidate mistakes
pipeline: MultiPV=3 records every runner-up into alt_moves_json
pipeline: engine failure sets analysis_state='failed' and does not throw to the caller
pipeline: analysis_state transitions pending→running→done
findability: findability is P_maia of the stockfish best move
findability: temptation is P_maia of the played move
findability: instructiveness is winLoss * findability
findability: the probe uses classic mode with VerboseMoveStats, never policyhead
findability: POLICY_TEMPERATURE is passed explicitly, never left at lc0's default
findability: the maia_model and policy_temperature used are recorded on the puzzle
findability: unparseable policy output falls back to binary 1.0/0.25 and logs a warning
```

---

## Phase 7 — Puzzle selection and scheduling

**Status:** Complete — 2026-08-26

**Branch:** `feat/phase-7-puzzles`  
**Files:** `src/domain/puzzles/select.js`, `src/domain/puzzles/attempt.js`, `src/domain/review/queue.js`, `src/domain/review/rating.js`, `src/adapters/scheduler/`
**Note:** `dedupe.js` and its three tests (`dedupe: …`) remain deferred — the tests are in `select.test.js` as `test.fails(...)` stubs.

```
select: findability >= 0.04 becomes a puzzle
select: findability < 0.04 is tagged engine_only and excluded from the queue
select: high temptation is tagged common_trap
select: puzzles are ranked by instructiveness and capped at 6 per game
select: phase is derived as opening|middlegame|endgame
select: every accepted move within NEAR_MISS_WIN_PTS is stored in accepted_moves_json
select: puzzles from a timed game are tagged was_timed
dedupe: a repeated FEN bumps times_seen instead of inserting
dedupe: findability is recomputed only when the nearest maia_model has changed
dedupe: a recompute records both the old and the new maia_model
attempt: the server derives correct and rating from {move, msTaken, hintUsed, attemptNo}
attempt: the client cannot influence rating — a rating field in the body is rejected
attempt: ANY accepted_moves_json entry is correct, not just the single runner-up
attempt: a move 2.0 win% points worse than best is accepted as correct
attempt: a move 5 win% points worse than best is not accepted
rating: wrong or hinted infers Again
rating: correct over 25 s infers Hard
rating: correct within 25 s infers Good
rating: correct under 6 s on the first try infers Easy
rating: a retry before success still infers Again
scheduler: Again yields a nearer due date than Good
scheduler: an attempt writes a reviews row and moves fsrs_cards.due
followup: a correct first move still requires the follow-up from the stored pv
followup: a wrong follow-up after a correct first move infers Hard
followup: a wrong follow-up is never Again and never Easy
followup: a pv shorter than 2 plies asks no follow-up and writes NULL
followup: a NULL followup_correct is not counted as a failure in stats
followup: the Easy window is measured to the FOLLOW-UP, not to the first move
practice: the post-game quiz writes practice=1, rating NULL, and does not schedule
practice: the post-game quiz creates the card with due = tomorrow
practice: drill-ahead on an empty queue also writes practice=1 and does not schedule
practice: suspect_recall is only evaluated on the first SPACED review, never on practice
attempt: correct under 2 s on the first spaced review sets suspect_recall
queue: a card with reps>=5, no lapses, interval>180d is graduated out of the queue
queue: a graduated card keeps its FSRS state and is counted in stats
queue: above DUE_SOFT_CAP the queue orders by instructiveness x overdue
queue: the due badge reports "40+" rather than the true count above the cap
queue: an empty queue is reported as a win state, not an error
balance: every parameter in config.js matches docs/game/balance.md
```

---

## Phase 8 — Docker build and engine acceptance

**Status:** Complete — 2026-08-26

**Branch:** `feat/phase-8-docker`  
**Files:** `Dockerfile`, `docker-compose.yml`, `scripts/smoke.sh`, `scripts/fetch-weights.sh`

Gated by `scripts/smoke.sh` passing in-container plus the verification section in `initial_idea.md` for engine checks.

---

## Phase 9 — Web UI

**Status:** Complete — 2026-08-26

**Branch:** `feat/phase-9-ui`  
**Files:** `public/`, `src/shared/quality.js`, `src/shared/strings.json`

```
quality: every tier maps to exactly one glyph and one hex
quality: only the five glyph tiers are annotated in the move list
quality: OK and Good are never distinguished by colour alone anywhere
quality: every breakdown-bar segment carries its tier name as a label
regression: tokens.css hex values match src/shared/quality.js exactly
board: every square tint composites to dE >= 8 from its base square
board: every tint pair is dE >= 8 on both light and dark squares
board: the dark square clears 3:1 against surface-page and surface-1
board: no piece/square composite drops below 2.2:1
board: review's board is read-only — no drag, no click-to-move handlers
meter: queue health is due / DUE_SOFT_CAP and reads 40+ above the cap
stats: the retired-mistakes tile renders at zero without looking broken
clock: an untimed game renders no clock panel at all
streak: settings.show_streak=0 removes the tile and the summary line
drill: correct/incorrect feedback leads with a glyph, not a colour
copy: every user-facing string comes from src/shared/strings.json
copy: strings.json and voice_and_tone.md agree
copy: no prose string contains an exclamation mark
copy: every termination enum value has exactly one string
motion: prefers-reduced-motion zeroes every duration and disables auto-advance
```

---

## Phase 10 — TUI

**Status:** Complete — 2026-08-26

**Branch:** `feat/phase-10-tui`  
**Files:** `bin/chess.js`, `tui/`

```
board: the start position renders 32 columns per rank in glyph mode
board: --ascii renders 8 single-width letters per rank
board: piece glyphs are all from U+265A-265F with VS15 appended
board: every glyph reserves 2 columns regardless of reported width
board: a dark empty square is filled with U+2591 and a light one is blank
board: --hatch=none emits no U+2591
board: mouse hit-test inverts render coordinates back to the right square
theme: --check reports every square colour in luminance [0.10, 0.30]
theme: --check reports every piece/square contrast >= 3:1
theme: no COLORTERM downgrades every hex to an ANSI-256 index
input: an unambiguous SAN prefix resolves to one legal move
input: an ambiguous prefix does not submit
input: Tab completes to the longest common prefix
input: the TUI imports no chess rules engine
input: the TUI computes no correctness and no FSRS rating
clock: the TUI displays the server's clock and never decides a flag-fall
streak: --no-streak overrides settings.show_streak for the session only
drill: feedback leads with a glyph and survives --plain and --ascii
```

---

## Phase 11 — Production readiness review

**Status:** Complete — 2026-08-27

**Branch:** `docs/phase-11-review`

8-section review of the implementation, findings labelled `A-1…A-n`. `implementation_plan.md` archived. `feature_spec.md` stays living.

---

## Phase 12 — Incremental analysis (pre-evaluation during play)

**Status:** Complete — 2026-08-27

**Branch:** `feat/phase-12-incremental-analysis`  
**Files:** `src/adapters/engine/engine-pool.js`, `src/api/ws/analysis-service.js`, `src/domain/analysis/pipeline.js`  
**Spec refs:** FR-ANALYSE-9–13, FR-ENGINE-5–7, NFR-A1b, NFR-A5

**Design:** After each `move` WS message is processed, the server submits the resulting FEN to the serialised analysis queue at depth 20 (Threads=4, Hash=512). By game-end, most or all pass-1 evals are cached in `move_evals`. The post-game pipeline skips any ply with an existing row and jumps straight to pass-2. When the game ends, the analysis engine is reconfigured to Threads=6, Hash=1024 before pass-2 begins.

```
incremental: after each accepted move a pass-1 eval job is queued for the resulting FEN
incremental: the queued job stores the result in move_evals(game_id, ply)
incremental: the post-game pipeline skips plies that already have a move_evals row
incremental: depth 20 is used when queue depth <= INCREMENTAL_MAX_QUEUE (default 5)
incremental: depth 18 is used when queue depth > INCREMENTAL_MAX_QUEUE (catch-up mode)
incremental: a game where all plies were pre-evaluated reaches analysis_done in <= 70 s
incremental: a partially pre-evaluated game uses cached rows and only runs remaining plies
incremental: abandoned-game move_evals rows are kept and not deleted
incremental: pre-evaluated rows are indistinguishable from post-game pass-1 rows in schema
pool: game SF engine (requestMove) is configured with Threads=1, Hash=16
pool: analysis SF uses Threads=4, Hash=512 during the play phase
pool: analysis SF is reconfigured to Threads=6, Hash=1024 before post-game pass-2
pool: analysis SF reconfiguration uses setoption, not process restart
pool: game engine and analysis engine are never the same UciEngineClient instance
pipeline: pass-2 depth is 22 (not 20)
```

**DoD:** All tests green; `make verify` passes; a real game measured end-to-end shows post-game analysis completes in ≤ 70 s when pre-eval ran during play.

---

## Phase 13 — Eval POV normalisation

**Status:** Complete — 2026-08-28

**Branch:** `fix/phase-13-eval-pov`  
**Files:** `src/shared/pov.js` (new), `src/adapters/engine/uci-engine-client.js`, `src/adapters/engine/scripted-engine-client.js`, `tests/unit/pov.test.js` (new), `tests/unit/pipeline.test.js`, `tests/unit/analysis-service.test.js`, `scripts/regrade.js` (new), `docs/features/pawnbook/feature_spec.md`  
**Spec refs:** FR-ENGINE-8

**Design:** `src/ports/engine-client.js` declares `cp` as *"normalised to White's POV"* but no adapter honoured it. `UciEngineClient._doEval` and `ScriptedEngineClient.eval` both returned `top.cp` straight from the UCI `info` line, which is **always side-to-move relative**. As a result `cp_white` alternated in sign by ply, collapsing `cpLoss` to 0 for one side and inflating it for the other — both stored `maia-1600` games read at 23–31% accuracy instead of ≈85–92%.

Fix: one exported helper `normaliseToWhitePov(fen, result)` in `src/shared/pov.js` — parses the FEN's side-to-move field and negates `cp`, `mate`, and every `lines[]` entry when `b`. Both adapters call it before returning. `scripts/regrade.js` (engine-free, idempotent) re-signs `cp_white`/`mate_in` for existing rows and re-derives the full grading chain from the corrected values. **Must run in the same deployment as the adapter fix** because `pipeline.js:59` restores cached evals as `cp: e.cp_white ?? e.cpWhite` — a resumed analysis over pre-fix rows would mix both sign conventions inside one game.

```
engine: eval negates cp when Black is to move
engine: eval leaves cp unchanged when White is to move
engine: eval negates mate when Black is to move
engine: every multiPV line is normalised, not just the top line
engine: the scripted client applies the same normalisation as the UCI client
pipeline: consecutive positions no longer alternate in sign for a quiet game
regression: a Black-to-move mate score is reported as negative from White POV
```

**DoD:** All green; `make verify` passes; `scripts/regrade.js` re-derives the two stored `maia-1600` games to ≈85%/≈90% and ≈87%/≈92% rather than 23%/31%; the review eval graph is visually smooth; a `fix(engine):` changelog entry is present.

---

## Phase 14 — Playing-strength estimate

**Status:** Complete — 2026-08-28

**Branch:** `feat/phase-14-playing-strength`  
**Files:** `src/shared/balance.js`, `src/domain/analysis/grade.js`, `src/domain/analysis/pipeline.js`, `src/adapters/sqlite/schema.js`, `src/adapters/sqlite/repositories.js`, `src/adapters/memory/repositories.js`, `src/ports/repositories.js`, `src/api/ws/analysis-service.js`, `src/api/routes/games.js`, `public/games.html`, `public/js/games.js`, `public/review.html`, `public/js/review.js`, `scripts/refit-strength.js` (new), `calibration/strength-model.json` (new), `docs/research/strength-estimation.md` (new), `tests/unit/strength.test.js` (new), `tests/unit/analysis-service.test.js`, `tests/unit/api-routes.test.js`, `tests/unit/ui-phase9.test.js`, `tests/contract/repositories.test.js`  
**Spec refs:** FR-GRADE-6–11, FR-ANALYSE-14–15, FR-STORE-8–9, FR-STATS-5, Q-7, NFR-A6, NFR-STR

**Design:** Regan & Haworth's `ln(1+x)` scaled error, averaged over eligible plies, mapped linearly to Elo. Eligible plies exclude only-moves, mate evals, and decided positions (`|cpWhite| > STRENGTH_DECIDED_CP`). Both sides are scored symmetrically under identical criteria on the shared White-POV evaluation series — they are a disjoint partition, not the same ply set. The opponent's known Elo, the player's stored Elo, and the game result are never inputs (`FR-GRADE-10`), which makes every game against a rated Maia a live calibration sample.

Coefficients are versioned in `calibration/strength-model.json` (append-only) and read from `src/shared/balance.js`. A `STRENGTH_COEFF_VERSION` constant ties them together; a test enforces the invariant. `scripts/refit-strength.js` runs WLS regression of `opponent_elo ~ ase` over `strength_samples` once ≥ 20 samples spanning ≥ 3 distinct ratings are available — it appends to the JSON and prints paste-ready constants but never writes `balance.js`.

The `_saveFailed()` helper in `analysis-service.js` reads the existing game row before every failure save and carries `accuracy`, `opponentAccuracy`, `strengthElo`, and `opponentStrengthElo` forward, so a failed re-analysis cannot null a previously stored result (`FR-ANALYSE-15`).

The review page rolling aggregate uses inverse-variance weighting over the most recent `STRENGTH_ROLLING_N` games. SE is recomputed on read from stored `(n, sd)` — never stored — so a coefficient refit is retroactive for free.

```
strength: scaledError(0) is 0
strength: scaledError is strictly increasing and compresses large losses
strength: a cpLoss above STRENGTH_CP_CAP is winsorised to the cap
strength: playingStrength(ase = STRENGTH_ANCHOR_ASE) returns STRENGTH_ANCHOR_ELO
strength: playingStrength is strictly decreasing in average scaled error
strength: playingStrength clamps to [STRENGTH_ELO_MIN, STRENGTH_ELO_MAX]
strength: a flawless game never returns Infinity or NaN
strength: zero eligible plies returns ase null, sd 0 and strength null, never NaN
strength: exactly one eligible ply returns sd 0, not NaN
strength: playingStrength returns an integer Elo and an integer standard error
strength: playingStrength returns null below STRENGTH_MIN_PLIES eligible plies
strength: playingStrength ignores plies where the mover had exactly one legal move
strength: playingStrength ignores plies whose pre-move eval is a mate score
strength: playingStrength ignores plies with |cpWhite| above STRENGTH_DECIDED_CP
strength: playingStrength reports n, ase, sd and p75Loss alongside the estimate
strength: p75Loss is the 75th percentile of winsorised cpLoss over eligible plies only
strength: p75Loss does not affect the estimate or the standard error
strength: the standard error is ELO_PER_ASE * sd / sqrt(n)
strength: a wider spread of losses yields a wider standard error at equal n
strength: a clean game estimates above a sloppy game of the same ply count
strength: playingStrength never reads a result, a player Elo, or an opponent Elo
pipeline: runAnalysis returns both sides' strength beside accuracy
pipeline: every position records its legal-move count for strength filtering
pipeline: strength estimation issues no engine calls
pipeline: a six-move game returns null strengths, not zero
pipeline: both sides' eligibility gates are evaluated on the same White-POV series
pipeline: a ply is eligible for exactly one side, never both and never neither
analysis: the success save persists both strength estimates and both sample rows
analysis: a failed analysis does not null a previously stored strength estimate
analysis: a failed analysis does not null a previously stored accuracy
store: [sqlite|memory] strengthElo round-trips through save and findById
store: [sqlite|memory] strengthElo survives a second save that supplies it
store: [sqlite|memory] strengthElo is exposed by listRecent
store: [sqlite|memory] a strength_samples row round-trips per side
store: [sqlite|memory] a strength_samples row carries p75Loss and was_timed for later refitting
store: [sqlite|memory] saveStrengthSample is idempotent on (gameId, side)
store: [sqlite|memory] listStrengthSamples returns newest first and honours limit
store: [sqlite|memory] listStrengthSamples filters by side
store: [sqlite] deleting a game removes its strength_samples rows
store: an absent strength column loads as null, not zero
routes: GET /api/games exposes both strength estimates
routes: GET /api/games/:id/review exposes both estimates, their SEs and the rolling aggregate
routes: the review standard error equals ELO_PER_ASE * sd / sqrt(n) from the stored sample
routes: the rolling aggregate is inverse-variance weighted, not a plain mean
routes: the rolling aggregate is null when no game has enough eligible plies
routes: a game with no estimate exposes null, not zero
ui: games.html has eight columns and the loading row spans all eight
ui: games.js renders both strength numbers in one right-aligned cell
ui: games.js renders an em dash for a null estimate
ui: review.js writes strength-line as a sibling of acc-bars, not into it
balance: every STRENGTH_ parameter is documented in balance.md
calibration: the stored maia-1600 fixture estimates its opponent within 300 Elo of 1600
calibration: refit-strength refuses to fit below 20 samples or 3 distinct ratings
calibration: refit-strength tolerates an sd of 0 without an infinite weight
calibration: refit-strength appends a version and never rewrites an existing one
calibration: the newest strength-model.json entry matches balance.js and STRENGTH_COEFF_VERSION
```

**DoD:** All 634 tests pass (632 passing + 2 expected fail); branch coverage 91.03%; `scripts/refit-strength.js` exits non-zero on the 2-game corpus with the required message; `calibration/strength-model.json` v1 committed; `docs/research/strength-estimation.md` written; no model binary in any commit.

---

## Phase 15 — Acquire the upgrade assets

**Status:** Complete — 2026-08-28

**Branch:** `feat/phase-15-upgrade-assets`  
**Files:** `.gitignore`, `scripts/build-opening-book.js` (new), `docs/research/skill-models.md` (new), `docs/research/opening-elo-book.md` (new)  
**Spec refs:** none (acquisition only — no `src/` changes)

**Design:** Acquire and verify Maia-3 and Maia-2, and write the opening-book script, so the v2 refit has inputs to fit against. Nothing in `src/` changes; `make verify` output is identical before and after.

**Maia-3 (primary).** Fetched via `maia3-cache --cache-dir weights/maia3`. Sizes match the HF-published bytes: 5M = 20,968,049 B, 23M = 91,799,307 B. UCI interface confirmed: all five options (`SelfElo`, `OppoElo`, `MultiPV`, `Temperature`, `TopP`) advertised. Decisive test: SelfElo 1100 vs 2400 produces different MultiPV orderings on `e2e4 e7e5 Nf3` — conditioning is real. Wall-clock (M4 CPU): ~430 ms first call (model load), ~15–50 ms subsequently.

**Maia-2 (fallback).** Fetched from `shermansiu/maia2-rapid` (93 MB) into `weights/maia2/original/model.pt` and `from_pretrained` also downloaded the 280 MB Drive file to `weights/maia2/rapid_model.pt`. SHA-256 of the HF file verified against the digest pinned in `CSSLab/maia2/model.py`: `65aae846...e997` — exact match. Smoke test: `inference_each` on the start position at elo_self=1500 returns a distribution summing to 0.9999 with plausible opening moves. **API correction from plan:** maia2 0.11.0 `prepare()` takes no arguments; `inference_each` returns `(dict[uci→prob], win_prob)` — the plan's pre-fetch description was inaccurate.

**Opening book.** `scripts/build-opening-book.js` written. Exits non-zero with the token URL when `LICHESS_TOKEN` is absent (verified). BFS crawl, EPD-keyed, rate-limited at ≤ 1 req/s, resumes from partial output, writes `calibration/opening-elo-book.json` with provenance header. Crawl not yet run (no Lichess token in this environment).

```
maia3:   uci advertises SelfElo, OppoElo and MultiPV as spin options
maia3:   the multipv ordering CHANGES between SelfElo 1100 and SelfElo 2400
maia3:   Temperature 0 makes two identical go calls return the same bestmove
maia3:   per-go wall-clock recorded for 5M and 23M on this machine
maia2:   the rapid checkpoint matches the SHA-256 pinned in CSSLab/maia2/maia2/model.py
maia2:   from_pretrained validates the local file and loads without Drive re-download
maia2:   inference_each on the start position returns a distribution summing to ~1
book:    build-opening-book exits non-zero with the token URL when LICHESS_TOKEN is unset
```

**DoD:** Maia-3 5M and 23M cached in `weights/maia3/` (gitignored); the SelfElo ordering test passing; Maia-2 rapid checkpoint on disk and digest-verified; `docs/research/skill-models.md` and `docs/research/opening-elo-book.md` written; `scripts/build-opening-book.js` exits cleanly on the no-token path; no model binary in any commit; `make verify` suite unchanged.

## Phase 16 — Maia-3 UCI integration (Complete — 2026-08-28)

**Status:** Complete  
**Branch:** `feat/phase-16-maia3`  
**Files:**
- `src/config.js` — added `maia3` to `NATIVE_PATHS` and `CONTAINER_PATHS`
- `src/domain/game/roster.js` — changed all maia entries to `type: 'maia3'`; added `maia-2000`; made `maia-2200` non-optional; added `getMaiaAnalysisWeights()`; updated `getAvailableOpponents()` for maia3
- `src/adapters/engine/engine-pool.js` — added `maia3` branch: one shared process, `SelfElo`/`Temperature 0` set per move
- `src/api/ws/analysis-service.js` — findability uses `getMaiaAnalysisWeights()` (lc0 on-disk weights), not game roster filter
- `tests/unit/roster.test.js` — updated for new entry count (19), type changes, new functions
- `tests/unit/engine-pool.test.js` — new: maia3 routing, binary path, SelfElo dispatch

**Tests:**
```
roster: getRosterTable returns all 19 entries
roster: getOpponent resolves a known id (type is now maia3)
roster: getOpponent throws for an unknown id
roster: drawfish has elo=null
roster: maia-2200 is no longer optional (maia3-backed)
roster: maia-2000 fills the former 1900→2200 gap
roster: sf-max has elo=3190
roster: getAvailableOpponents excludes all maia3 entries when binary is missing
roster: getAvailableOpponents includes maia3 entries when binary exists
roster: getMaiaAnalysisWeights returns lc0 weight IDs that exist on disk
roster: getMaiaAnalysisWeights returns empty when no lc0 pb.gz files are present
roster: getMaiaAnalysisWeights only returns IDs whose file exists
engine pool: maia3 routing: requestMove for maia3 spawns the maia3 binary, not lc0
engine pool: maia3 routing: requestMove for maia3 passes --cache-dir and --local-files-only args
engine pool: maia3 routing: requestMove for maia3 sends SelfElo matching opponent.elo
engine pool: maia3 routing: requestMove for maia3 sends Temperature 0
engine pool: maia3 routing: requestMove for maia3 returns the engine bestmove
engine pool: maia3 routing: requestMove reuses the maia3 client across multiple calls (single process)
engine pool: maia3 routing: SelfElo is updated on every requestMove for different Elos
engine pool: maia3 routing: requestMove for unknown type throws
```

**DoD:** All 20 new tests passing; full suite 644 passing + 2 expected fails; branch coverage 91.05%; no changes to `src/domain/` analysis or scoring logic; `getMaiaAnalysisWeights()` decouples findability from the game roster type; lc0 Maia-1 weights on disk continue to serve pass-3 findability analysis; the 1900→2200 gap is closed with `maia-2000` and a now-required `maia-2200`; `make verify` clean.

## Phase 17 — Production-readiness hardening (Complete — 2026-08-31)

**Goal:** Close three production-readiness gaps: (1) weights-missing check fires before a game row is created, (2) analysis engine acquisition retries on transient failures, (3) full error-path test coverage.

**Files changed:**
- `src/domain/game/roster.js` — added `checkOpponentAvailability(opponent)`: throws `WeightsMissingError` for maia3 when binary is missing, and for maia (lc0) when the `.pb.gz` weights file is absent; stockfish and drawfish are always available
- `src/api/ws/handlers.js` — `handleNewGame` calls `checkOpponentAvailability(opponent)` before `gameRepo.save()`; `WeightsMissingError` is caught by the existing try/catch and sent as `{ type: 'error', error_code: 'weights_missing' }`; no orphan game rows are written
- `src/api/ws/analysis-service.js` — `_acquireWithRetry(thunk)` wraps `getAnalysisSfClient()`: 3 attempts with exponential backoff (100ms × 2^attempt) plus random jitter (0–50ms); re-throws on final failure so `_saveFailed` and `analysis_failed` WS error are still sent
- `tests/unit/ws/error-paths.test.js` — new: 6 tests covering all three scenarios

**Tests:**
```
WeightsMissingError: maia3 opponent: returns weights_missing error and saves no game row
WeightsMissingError: maia1 (lc0) opponent: returns weights_missing error and saves no game row
WeightsMissingError: stockfish opponent: starts game normally even when existsSync returns false
hint_not_allowed: returns hint_not_allowed error when hint is sent during a ranked game
analysis engine unavailable: saves analysis_state=failed and sends analysis_failed error when engine unavailable
analysis engine unavailable: saves analysis_state=failed when runAnalysis throws mid-pass
```

**DoD:** All 6 new tests passing; full suite 1244 passing + 2 expected fails; branch coverage 91.85%; `make verify` clean.
