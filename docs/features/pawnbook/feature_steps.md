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
**Files:** `src/domain/puzzles/select.js`, `src/domain/puzzles/dedupe.js`, `src/domain/puzzles/attempt.js`, `src/domain/review/queue.js`, `src/domain/review/rating.js`, `src/adapters/scheduler/`
**Note:** `dedupe.js` implemented in Phase 7b (feat/phase-7b-dedupe). Also adds `updateFindability` to both adapters and the port.

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

## Phase 18 — Maia-3 log-probability strength probe (Complete — 2026-08-31)

**Goal:** Augment the Regan-Haworth strength estimate with a second signal derived from Maia-3's conditioned policy: the mean log-probability of the player's actual moves under Maia-3 at the player's estimated Elo. This measures "how human-at-your-level are your move choices?" — orthogonal to centipawn loss.

**Design:** Pass 4 runs after pass 3, for every eligible player ply (same filter as `playingStrength`: legalMovesBefore > 1, mateIn null, |cpWhite| ≤ STRENGTH_DECIDED_CP). Maia-3 is called with SelfElo = pass-1 strength estimate (rounded to nearest 100, clamped to [1100, 2400]); when pass-1 strength is null (short game), the stored playerElo is used as SelfElo. The probability of the played move under Maia-3's policy is extracted; `maiaLogProb = mean(log(P_maia3(played_move)))` over eligible positions. Zero probability is clamped to 0.001 to avoid -Infinity. The result is stored in `games.maia3_log_prob`.

**Files changed:**
- `src/domain/analysis/grade.js` — added `maiaLogProb(probabilities)` pure function
- `src/adapters/engine/scripted-engine-client.js` — added `setOption()` (records calls for test assertions)
- `src/adapters/engine/engine-pool.js` — added `getMaia3PolicyClient()`: separate pool key `maia3-policy`, Temperature=1.0, VerboseMoveStats=true on first init
- `src/domain/analysis/pipeline.js` — added `maia3Client` optional param; tracked `playerMaia3Positions` in move-eval loop; added Pass 4; returns `playerMaiaLogProb` in result
- `src/adapters/sqlite/schema.js` — added `maia3_log_prob REAL` to CREATE TABLE and ALTER TABLE migration
- `src/adapters/sqlite/repositories.js` — added `maia3_log_prob` to save/findById
- `src/api/ws/analysis-service.js` — acquires `maia3PolicyClient` (optional, non-fatal failure); passes to `runAnalysis`; saves `maia3LogProb` to game row; carries forward on failure/retry
- `eslint.config.js` — added `site/.vitepress/dist/` to ignores (pre-existing lint false-positives)
- `Makefile` — aligned `make verify` to use `--omit=dev` to match CI audit job
- `tests/unit/strength.test.js` — 6 new `maiaLogProb` tests
- `tests/unit/engine-pool.test.js` — 6 new `getMaia3PolicyClient` tests
- `tests/unit/pipeline.test.js` — 6 new pass-4 tests

**Tests:**
```
strength: maiaLogProb: maiaLogProb([]) returns null with n=0
strength: maiaLogProb: maiaLogProb with a single probability returns mean(log(p))
strength: maiaLogProb: maiaLogProb over multiple probabilities returns their mean log
strength: maiaLogProb: maiaLogProb clamps zero probability to a floor, not -Infinity
strength: maiaLogProb: maiaLogProb is more negative for lower probability moves
strength: maiaLogProb: maiaLogProb never returns NaN
engine pool: maia3 policy client: getMaia3PolicyClient returns a client
engine pool: maia3 policy client: getMaia3PolicyClient sets Temperature 1.0 on first init
engine pool: maia3 policy client: getMaia3PolicyClient sets VerboseMoveStats true on first init
engine pool: maia3 policy client: getMaia3PolicyClient uses a separate pool key from game-play maia3
engine pool: maia3 policy client: getMaia3PolicyClient reuses the policy client across calls
engine pool: maia3 policy client: getMaia3PolicyClient passes --cache-dir and --local-files-only
pipeline pass 4: pass 4: result includes playerMaiaLogProb when maia3Client is provided
pipeline pass 4: pass 4: probes maia3 for each eligible player ply
pipeline pass 4: pass 4: sets SelfElo on maia3Client for each eligible ply
pipeline pass 4: pass 4: skipped when maia3Client is not provided
pipeline pass 4: pass 4: skipped when all player plies are ineligible (decided position)
pipeline pass 4: pass 4: uses stored playerElo as SelfElo when playerStrength is null
```

**DoD:** All 18 new tests passing; full suite 1266 passing + 2 expected fails; branch coverage 91.42%; `make verify` clean; `maia3_log_prob` stored in `games` table; pass 4 skipped gracefully when maia3 binary unavailable.

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

## Phase 19a — Best-move arrow on puzzle failure (Complete — 2026-08-31)

**Goal:** When a player fails a puzzle (second wrong attempt), draw a green arrow from the correct move's source to its destination on the board, making the correct solution immediately visible without text decoding.

**Files changed:**
- `public/js/lib/board.js` — loaded Arrows extension + arrows.css; exposed `showArrow(from, to, color)` and `clearArrows()` on the board wrapper
- `public/js/puzzles.js` — store board instance in `currentBoard`; on attempt-2 failure draw success arrow from `bestMoveUci`
- `public/js/quiz.js` — same pattern

**DoD:** Arrow renders on the board at the correct move after two wrong attempts; no test changes (UI-only); `make verify` clean.

## Phase 19b — Threat explanation on puzzle failure (Complete — 2026-08-31)

**Goal:** Show a one-sentence human-readable explanation of why the played move was bad, computed deterministically from board state using chess.js — no LLM, no network call.

**Design:** `computeThreatExplanation(fen, playedMoveSan, sideToMove)` loads the FEN, applies the played move, then scans all player pieces for hanging squares (attacked and undefended, or attacked by a cheaper piece). Two template variants: (1) moved piece is itself hanging — "The knight moved to d5 has no safe square — the opponent can capture it."; (2) defender-removal — "Moving the rook away from e1 left the queen on e8 undefended." Returns null silently if no obvious threat is detected, so feedback degrades gracefully to the existing arrow.

**Files changed:**
- `public/js/puzzles.js` — added `computeThreatExplanation`; appended explanation block in teach branch
- `public/js/quiz.js` — same

**DoD:** One-sentence threat explanation renders on the second wrong attempt when a hanging piece is detected; degrades gracefully to null; no test changes (UI-only); `make verify` clean.

## Phase 19c — Motif classifier (Complete — 2026-08-31)

**Goal:** Implement a `classifyMotif(fen, playedMoveUci, sideToMove)` function that returns a named motif tag for the mistake. Persist the tag on puzzle rows. Start with `hanging_piece` and `fork`.

**Files changed:**
- `src/domain/analysis/motif-classifier.js` — NEW: pure `classifyMotif()` using chess.js; detects `hanging_piece` (post-move player piece attacked with no defenders) and `fork` (single opponent non-king attacks 2+ valuable player pieces); returns null otherwise
- `src/adapters/sqlite/schema.js` — added `motif_tag TEXT` column to `puzzles` DDL + ALTER TABLE migration
- `src/adapters/sqlite/repositories.js` — `motif_tag` in INSERT
- `src/adapters/memory/repositories.js` — `motifTag` propagated through in-memory save
- `src/api/routes/puzzles.js` — `motifTag` exposed in `formatCard()`
- `tests/unit/motif-classifier.test.js` — NEW: 7 tests (null inputs, illegal move, opening move, hanging knight, defender-removal, fork, quiet)

**Tests:**
```
classifyMotif: returns null for null inputs
classifyMotif: returns null for an illegal move
classifyMotif: returns null for a normal opening move
classifyMotif: detects hanging_piece — knight moves to attacked, undefended square
classifyMotif: detects hanging_piece — removing the only defender exposes a piece
classifyMotif: detects fork — opponent knight forks two valuable white pieces
classifyMotif: returns null when no motif is detectable
```

**DoD:** 7 new tests passing; `motif_tag` column migrated in DB; `make verify` clean.

## Phase 19d — Motif breakdown and top-weakness tile (Complete — 2026-08-31)

**Goal:** Aggregate motif tags across all puzzle rows and surface a "top weakness" tile on the stats page showing which motif pattern the player blunders on most often.

**Files changed:**
- `src/api/routes/stats.js` — computed `motifBreakdown` (count per tag) and `topWeakness` (tag + count) from puzzle rows; added to `GET /api/stats` response
- `public/stats.html` — added `#weakness-card` tile with `#weakness-text` and `#weakness-bars`
- `public/js/stats.js` — `renderWeaknessTile(stats)` renders sorted breakdown bars and top-pattern sentence; `MOTIF_LABEL` map for display names

**DoD:** Weakness tile renders when motif data exists; hidden when no motifs tagged; existing stats tests pass; `make verify` clean.

## Phase 19e — Motif classifier: back_rank and missed_capture (Complete — 2026-08-31)

**Goal:** Expand the classifier to detect two more common club-level patterns. Priority order becomes: `hanging_piece → fork → back_rank → missed_capture`.

**Design:**
- `back_rank`: post-move, player's king is on their back rank with no pawn on the 3 squares directly in front of it, AND opponent has at least one rook or queen.
- `missed_capture`: pre-move, a winning capture existed (target undefended, or cheapest attacker < target value) but the played move didn't take it.

**Files changed:**
- `src/domain/analysis/motif-classifier.js` — added `_hasBackRank` and `_hasMissedCapture` helpers; updated priority chain
- `public/js/stats.js` — `MOTIF_LABEL` extended with `back_rank` and `missed_capture`
- `site/research/chess-feedback.md` — motif table updated
- `tests/unit/motif-classifier.test.js` — 4 new tests (2 per motif, positive + negative)

**Tests:**
```
classifyMotif: detects missed_capture — undefended opponent piece left on the board
classifyMotif: missed_capture does not fire when player captures the free piece
classifyMotif: detects back_rank — king on back rank loses luft pawn, opponent has rook
classifyMotif: back_rank does not fire when king has pawn cover
```

**DoD:** All 11 classifier tests passing; `make verify` clean.

## Phase 19f — Motif-driven fallback explanation on puzzle failure (Complete — 2026-08-31)

**Goal:** When `computeThreatExplanation` returns null (non-hanging motif), fall back to a static one-sentence template keyed on `card.motifTag` for `back_rank`, `missed_capture`, and `fork`.

**Files changed:**
- `public/js/puzzles.js` — added `MOTIF_EXPLANATION` map; fallback used when dynamic explanation is null and `pos.motifTag` is set
- `public/js/quiz.js` — same

**DoD:** `back_rank` and `missed_capture` cards always surface an explanation on failure; `make verify` clean.

## Phase 19g — Motif tag badge on review page mistake list (Complete — 2026-08-31)

**Goal:** Show the motif tag as a small badge on each drillable mistake in the review page mistake list, and expose `motifTag` in the quiz position payload so the quiz failure path can read it.

**Files changed:**
- `src/api/routes/games.js` — `GET /api/games/:id/review` now includes `motifTag` on each mistake object; `formatQuizPosition` also exposes `motifTag`
- `public/js/review.js` — `renderMistake()` renders accent-coloured badge (e.g. "hanging piece") when `motifTag` is present
- `public/css/app.css` — added `.mistake-row__tag--motif` style
- `tests/unit/routes/games-routes.test.js` — 1 new test: `motifTag` round-trips from puzzle save to review response

**DoD:** 1 new test passing; badge visible on review page; `make verify` clean.

## Phase 19h — Backfill motif tags for existing puzzles (Complete — 2026-08-31)

**Goal:** Idempotent CLI script to classify motif tags for existing puzzle rows that pre-date the classifier. Fixes `SqliteError: no such column: motif_tag` on databases created before Phase 19c.

**Design:** `scripts/backfill-motif-tags.js` calls `applySchema(db)` on startup (runs the ALTER TABLE migration if needed), then SELECTs all tactical puzzles with `motif_tag IS NULL`, calls `classifyMotif` on each, and writes results in a single transaction. Supports `--dry-run` and `--db` flags; prints per-tag counts on completion.

**Files changed:**
- `scripts/backfill-motif-tags.js` — NEW: 87-line idempotent backfill script

**DoD:** Script runs against a live DB without errors; prints counts; `--dry-run` makes no writes; `make verify` clean.

## Phase 20 — Skill-dimension aggregation from motif tags (Complete — 2026-08-31)

**Goal:** Map each motif tag to a skill dimension (tactics / defense), aggregate across the player's puzzles, and surface the top weak dimension alongside the motif breakdown on the stats page.

**Design:** `MOTIF_DIMENSION` map exported from `motif-classifier.js` maps all 4 (later 8) motifs to a dimension. `GET /api/stats` computes `dimensionBreakdown` by rolling up `motifBreakdown` through the map and adds it to the response. The stats page weakness tile gains a dimension summary line ("7 of your 12 mistakes were tactics problems.").

**Files changed:**
- `src/domain/analysis/motif-classifier.js` — added `MOTIF_DIMENSION` export: `{ hanging_piece: 'tactics', fork: 'tactics', missed_capture: 'tactics', back_rank: 'defense' }`
- `src/api/routes/stats.js` — compute and return `dimensionBreakdown`
- `public/stats.html` — added `#dimension-text` inside `#weakness-card`
- `public/js/stats.js` — `DIMENSION_LABEL` map; `renderWeaknessTile` now renders dimension summary line
- `tests/unit/motif-dimension.test.js` — NEW: 8 tests for `MOTIF_DIMENSION` entries + aggregation logic
- `tests/unit/routes/state-stats-routes.test.js` — `dimensionBreakdown` assertions added to 2 existing tests

**Tests:**
```
MOTIF_DIMENSION: maps hanging_piece to tactics
MOTIF_DIMENSION: maps fork to tactics
MOTIF_DIMENSION: maps missed_capture to tactics
MOTIF_DIMENSION: maps back_rank to defense
MOTIF_DIMENSION: covers every known motif tag (no unmapped motif)
dimensionBreakdown in stats: is derived from motifBreakdown via MOTIF_DIMENSION
dimensionBreakdown in stats: ignores unknown tags gracefully
dimensionBreakdown in stats: produces empty object when no motifs are tagged
```

**DoD:** 8 new + 2 updated tests passing; `dimensionBreakdown` in stats response; `make verify` clean.

## Phase 21 — Prioritise weak-dimension puzzles in drill queue (Complete — 2026-08-31)

**Goal:** Close the deliberate-practice loop: when the stats page identifies the player's top weak dimension, the drill queue should surface over-cap tactical cards that match that dimension before other tactical cards.

**Design:** `/api/puzzles/due` computes `weakDimension` (top dimension from due-card motif tags via `MOTIF_DIMENSION`) and passes it to `sortDueCards`. Within the tactical over-cap group, cards whose motif maps to `weakDimension` sort before others. Opening cards and non-tactical cards are unaffected. The `motif_tag` column is now included in the `getDueCards` SELECT.

**Files changed:**
- `src/domain/review/queue.js` — `sortDueCards(cards, now, weakDimension = null)` extended: within the tactical over-cap group, `MOTIF_DIMENSION[motif_tag] === weakDimension` cards sort first
- `src/adapters/sqlite/repositories.js` — `p.motif_tag` added to `getDueCards` SELECT
- `src/api/routes/puzzles.js` — computes `weakDimension` via `_topWeakDimension(cards)`; passes to `sortDueCards`
- `tests/unit/queue.test.js` — 3 new tests (weak-dimension boost; opening-card precedence; null weakDimension fallback)

**Tests:**
```
sortDueCards: weak-dimension boost sorts matching tactical cards first within over-cap group
sortDueCards: opening cards still sort before tactical cards regardless of weakDimension
sortDueCards: weakDimension=null behaves identically to original sort
```

**DoD:** 3 new tests passing; drill queue now prioritises player's top weak dimension; `make verify` clean.

## Phase 22 — Maia-3 style score on review and stats pages (Complete — 2026-08-31)

**Goal:** Surface the Maia-3 log-probability strength probe (stored as `maia3_log_prob` in Phase 18) as a human-readable "Style match %" on the review page and as a rolling 10-game average on the stats page.

**Design:** Style score = `Math.round(100 * Math.exp(maia3LogProb))` — the geometric mean move probability expressed as a percentage. Rolling average = mean of `Math.exp(g.maia3LogProb) × 100` over the last 10 games with non-null `maia3LogProb`. Style tile is hidden when no data exists.

**Files changed:**
- `src/api/routes/games.js` — added `maia3LogProb: game.maia3LogProb ?? null` to `GET /api/games/:id/review` response
- `src/api/routes/stats.js` — computed `rollingStyleScore` from last 10 games; added to response
- `public/stats.html` — added `#style-tile` (hidden by default), `#style-val`, `#style-delta`
- `public/js/stats.js` — `renderStyleTile(stats)` populates or hides the tile; called from `renderAll`
- `public/js/review.js` — strength line appends "Style X%" when `maia3LogProb` is present
- `tests/unit/routes/games-routes.test.js` — 2 new tests: `maia3LogProb` present / null in review response
- `tests/unit/routes/state-stats-routes.test.js` — 2 new tests: `rollingStyleScore` computed / null

**Tests:**
```
GET /api/games/:id/review: includes maia3LogProb when game has one
GET /api/games/:id/review: maia3LogProb is null when game has none
GET /api/stats: rollingStyleScore is computed from last 10 games with non-null logProb
GET /api/stats: rollingStyleScore is null when no games have maia3LogProb
```

**DoD:** 4 new tests passing; style score visible on review when data available; `make verify` clean.

## Phase 23 — Motif classifier: overloaded_defender (Complete — 2026-08-31)

**Goal:** Detect the overloaded-defender pattern: a single player piece is the sole guardian of two or more attacked player pieces, making it impossible to defend both if the opponent strikes.

**Design:** `_hasOverloadedDefender(chess, playerColor, oppColor)` scans all attacked player pieces, records the sole defender (if only one exists) per piece, and returns true if any defender is sole guardian of ≥ 2 pieces.

**Files changed:**
- `src/domain/analysis/motif-classifier.js` — added `_hasOverloadedDefender`; added `overloaded_defender: 'defense'` to `MOTIF_DIMENSION`; updated priority chain and JSDoc
- `public/js/stats.js`, `review.js`, `puzzles.js`, `quiz.js` — label and explanation text added
- `tests/unit/motif-classifier.test.js` — 2 new tests (Re5 sole guardian of Nd5 + Nf5 → positive; flanking rooks give two defenders each → negative)
- `tests/unit/motif-dimension.test.js` — 1 new test; known-motif array expanded to 6

**DoD:** 3 new tests passing; 1298 total; 91.15% branch coverage; `make verify` clean.

## Phase 24 — Motif classifier: pinned_piece (Complete — 2026-08-31)

**Goal:** Detect the pin pattern: an opponent sliding piece (rook, bishop, queen) is aimed along a ray at a player piece, and behind that piece on the same ray is a more valuable player piece. The first piece is "pinned" — moving it would expose the second to capture.

**Design:** `_hasPinnedPiece(chess, playerColor, oppColor)` walks rays from every opponent sliding piece using a `_RAY_DIRS` table; fires when the first player piece on a ray has lower value than the second player piece on the same ray (`PIECE_VALUE[second] > PIECE_VALUE[first]`).

**Files changed:**
- `src/domain/analysis/motif-classifier.js` — added `_RAY_DIRS`, `_hasPinnedPiece`; `pinned_piece: 'tactics'` in `MOTIF_DIMENSION`
- `public/js/stats.js`, `review.js`, `puzzles.js`, `quiz.js` — label `'pin'` and explanation text
- `tests/unit/motif-classifier.test.js` — 2 new tests (Bb2 pins Nd4 against Qf6; no-alignment negative)
- `tests/unit/motif-dimension.test.js` — 1 new test; known-motif array expanded to 7 (wait, 6 at this point)

**DoD:** 2 new classifier tests; 1301 total; 91.15% branch coverage; `make verify` clean.

## Phase 25 — Motif classifier: skewer (Complete — 2026-08-31)

**Goal:** Detect the skewer pattern: the mirror of a pin. An opponent slider attacks a more valuable player piece; when it moves to safety, the less valuable player piece behind it is captured.

**Design:** `_hasSkewer(chess, playerColor, oppColor)` is the same ray-walking code as `_hasPinnedPiece` with the value comparison reversed: fires when `PIECE_VALUE[first] > PIECE_VALUE[second]` (first piece on the ray is more valuable than the second).

**Files changed:**
- `src/domain/analysis/motif-classifier.js` — added `_hasSkewer`; `skewer: 'tactics'` in `MOTIF_DIMENSION`; priority chain now has 7 entries
- `public/js/stats.js`, `review.js`, `puzzles.js`, `quiz.js` — label and explanation text
- `tests/unit/motif-classifier.test.js` — 2 new tests (Ba1 skewers Qb5 onto Rb2 via NE diagonal; negative null case)
- `tests/unit/motif-dimension.test.js` — 1 new test; known-motif array expanded to 7

**DoD:** 2 new classifier tests; 1304 total; 91.16% branch coverage; `make verify` clean.

## Phase 26 — Motif classifier: discovered_attack (Complete — 2026-08-31)

**Goal:** Detect the discovered-attack pattern: the player moves a piece that was blocking an opponent slider from reaching another player piece; after the move that piece becomes newly attacked.

**Design:** Before `chess.move()`, capture a `preAttacked` Set of squares of player pieces currently attacked by the opponent. After the move, `_hasDiscoveredAttack` checks whether any player piece ≥ knight value is now attacked by the opponent, was NOT in `preAttacked`, and is not the destination square (which is already covered by `hanging_piece`/`fork`). No second Chess instance required.

**Files changed:**
- `src/domain/analysis/motif-classifier.js` — added `preAttacked` Set capture pre-move; added `_hasDiscoveredAttack`; `discovered_attack: 'tactics'` in `MOTIF_DIMENSION`; priority chain now has 8 entries
- `public/js/stats.js`, `review.js`, `puzzles.js`, `quiz.js` — label and explanation text
- `tests/unit/motif-classifier.test.js` — 2 new tests (Rg4-g2 uncovers Rh4 attack on defended Nd4; quiet Ke1-e2 negative)
- `tests/unit/motif-dimension.test.js` — 1 new test; known-motif array expanded to 8

**DoD:** 2 new classifier tests; 1307 total; 91.19% branch coverage; `make verify` clean.

## Phase 27 — Composition root, injected clock/scheduler/ids/engine (Complete — 2026-08-30)

**Goal:** Extract a proper composition root so all stateful dependencies (clock, scheduler, ID generator, engine pool) are injected rather than constructed inline, enabling deterministic tests and a fake-engine mode that needs no Stockfish or lc0 binaries.

**Design:** `src/app.js` exports `createApp({db, clock, scheduler, enginePool})`, which wires every router and handler with injected deps. `src/server.js` becomes a thin shell that constructs real adapters and calls `createApp`. New adapter pairs: `RealTimer`/`ManualTimer` for the scheduler port; `UuidIds`/`SequentialIds` for the IDs port; `FakeEnginePool` for `ENGINE_MODE=fake` (returns first legal move — no engines required). Bug B15 fixed: `InMemoryGameRepository._normaliseMoveEval()` ensures `getEvals()` always returns snake_case, matching the SQLite adapter. Baseline lint debt cleared: `import/order` auto-fixed codebase-wide (42 → 0 errors).

**Files changed:**
- `src/app.js` — new composition root; `createApp` wires all routers/handlers
- `src/server.js` — refactored to thin shell; constructs real adapters + calls `createApp`
- `src/ports/clock.js`, `src/ports/scheduler.js`, `src/ports/ids.js` — JSDoc port contracts
- `src/adapters/scheduler/real-timer.js`, `src/adapters/scheduler/manual-timer.js` — scheduler adapter pair
- `src/adapters/ids/uuid-ids.js`, `src/adapters/ids/sequential-ids.js` — IDs adapter pair
- `src/adapters/engine/fake-engine-pool.js` — `ENGINE_MODE=fake`; first-legal-move deterministic engine
- `src/adapters/memory/repositories.js` — `_normaliseMoveEval()` helper fixing B15
- `src/api/ws/handlers.js`, `src/api/routes/*.js` — clock/scheduler/ids threaded through
- `tests/unit/adapters/phase-27-adapters.test.js` — 19 new tests covering `ManualTimer`, `SequentialIds`, `UuidIds`, `FakeEnginePool`

**DoD:** 19 new adapter tests; lint debt cleared (42 → 0 import/order errors); 90.23% branch coverage; `make verify` clean.

## Phase 28 — Dynamic slot-filled motif explanations (Complete — 2026-08-31)

**Goal:** Replace static one-sentence motif descriptions with position-specific explanations that name the actual pieces and squares involved, completing the template-NLG prescription from the research note.

Before: *"After this move one of your pieces was pinned — it was stuck in place because moving it would expose a more valuable piece behind it to capture."*
After: *"Your knight on d4 is pinned by the opponent's bishop on b2 — moving it would expose your queen on f6 to capture."*

**Design:** Pure function `explainMotif(fen, playedMoveUci, sideToMove, motifTag)` in `src/domain/analysis/motif-explainer.js`. Each of the 8 motifs has its own piece-finding logic that locates the concrete squares from the position and interpolates them into a template sentence. Returns `null` when the motif tag is absent or piece-finding fails.

**Files changed:**
- `src/domain/analysis/motif-explainer.js` — new; `explainMotif` with per-motif handlers for all 8 motifs
- `src/api/routes/games.js` (`formatCard`, `formatQuizPosition`) — `motifExplanation` added to every puzzle/quiz response
- `src/api/routes/puzzles.js` (`formatCard`) — `motifExplanation` added to due/practice card response
- `public/js/puzzles.js`, `quiz.js` — render explanation text below motif badge on failure
- `tests/unit/motif-explainer.test.js` — 16 tests covering all 8 motifs (positive + null cases)

**DoD:** 16 new tests; 1316 total; 90.65% branch coverage; `make verify` clean.

## Phase 29 — Motif-filtered drill sessions (Complete — 2026-08-31)

**Goal:** Close the deliberate-practice loop — a player can drill a specific weakness pattern directly from the stats page weakness tile.

**Design:** `GET /api/puzzles/due?motif=<tag>` filters the due-card list to puzzles whose `motif_tag` matches the query param. The drill page reads `?motif=` from its URL, passes it to the API, and shows a filter banner ("Drilling: fork · show all"). Stats page weakness tile gains "Drill this →" and per-bar "drill →" links that deep-link to the filtered drill session.

**Files changed:**
- `src/api/routes/puzzles.js` — `motif` query param filtering on `getDueCards`; same filter forwarded to practice endpoint
- `public/js/puzzles.js` — reads `?motif=` from URL; shows filter banner; "show all" back-link
- `public/js/stats.js` — "Drill this →" link on top weakness + per-bar "drill →" links
- `tests/unit/api-routes.test.js` — 2 new tests: filter returns only matching motif cards; absent param returns all cards

**DoD:** 2 new route tests; 1321 total; 90.61% branch coverage; `make verify` clean.

## Phase 30 — motifExplanation on review-page mistake list (Complete — 2026-08-31)

**Goal:** Surface position-specific motif explanations on the post-game review page, so players see exactly why each mistake was flagged.

**Design:** `GET /api/games/:id/review` maps `explainMotif(fen, played_move_uci, side_to_move, motif_tag)` onto each mistake and includes `motifExplanation` in the response. `renderMistake()` in the browser client renders the explanation as a `.mistake-row__explain` div below the motif badge when present.

**Files changed:**
- `src/api/routes/games.js` — `motifExplanation` field added to the mistakes mapping in the review endpoint
- `public/js/review.js` — `renderMistake()` renders `.mistake-row__explain` div when `m.motifExplanation` is truthy
- `tests/unit/api-routes.test.js` — 2 new tests: string explanation when motif + move present; null when motif absent

**DoD:** 2 new tests; 1323 total; 90.83% branch coverage; `make verify` clean.

## Phase 31 — Per-motif drill accuracy on stats page (Complete — 2026-08-31)

**Goal:** Show how accurately a player has drilled each motif pattern so the weakness tile reflects both frequency of mistakes and quality of drilling.

**Design:** `getMotifDrillAccuracy()` JOINs `reviews` and `puzzles`, filtering to first-attempt non-practice reviews (`attempt_no = 1 AND practice = 0`), and returns `[{motifTag, total, correct}]`. `GET /api/stats` exposes this as a `motifAccuracy` map keyed by tag. Stats page weakness bars annotate each row with accuracy % and a tooltip showing raw counts.

**Files changed:**
- `src/ports/repositories.js` — JSDoc for `PuzzleRepository#getMotifDrillAccuracy`
- `src/adapters/sqlite/repositories.js` — SQL JOIN implementation of `getMotifDrillAccuracy`
- `src/adapters/memory/repositories.js` — in-memory implementation of `getMotifDrillAccuracy`
- `src/api/routes/stats.js` — `motifAccuracy` map added to response
- `public/js/stats.js` — accuracy % displayed next to each motif bar; tooltip with raw counts
- `tests/unit/api-routes.test.js` — 2 new tests: accuracy populated from drill reviews; empty object when no reviews

**DoD:** 2 new tests; 1325 total; 90.81% branch coverage; `make verify` clean.

## Phase 32 — Focus recommendation card (Complete — 2026-08-31)

**Goal:** Give players a single actionable recommendation: "This is the pattern most worth drilling right now."

**Design:** Pure domain function `pickFocusMotif(motifBreakdown, motifAccuracy)` in `src/domain/review/focus.js`. Priority score = `mistakes × (1 − drillAccuracy)`; motifs with no drill history are scored at full penalty (rate = 0). `GET /api/stats` adds `focusMotif: { tag, mistakes, accuracy }`. Stats page renders a **Focus area** card above the weakness tile with motif label, mistake count, drill accuracy note, and a direct "Drill this now →" button.

**Files changed:**
- `src/domain/review/focus.js` — new; `pickFocusMotif` pure function
- `src/api/routes/stats.js` — `focusMotif` added to response
- `public/stats.html` — `#focus-card` element added before weakness tile
- `public/js/stats.js` — `renderFocusCard(stats)` renders the card; hidden when `focusMotif` is null
- `tests/unit/focus.test.js` — 5 unit tests covering prioritisation, no-history penalty, null on empty input
- `tests/unit/api-routes.test.js` — 2 new route tests

**DoD:** 7 new tests; 1332 total; 90.84% branch coverage; `make verify` clean.

## Phase 33 — Wire up drill streak (Complete — 2026-08-31)

**Goal:** Fix the always-zero streak bug and wire up activity recording so the streak counter reflects real daily drilling and game activity.

**Design:** Root cause: `streak_cache` was never written anywhere — streak was always 0. Fix: `GET /api/state` now computes streak live via `gameRepo.getStreak(now)`. Activity recording added at two call sites: `POST /api/puzzles/:id/attempt` calls `gameRepo.recordActivity(…, 'review')` after saving the review row; `finishGame` in `src/api/ws/handlers.js` calls `gameRepo.recordActivity(…, 'game')`. Stats page gains a streak tile (hidden when streak = 0 or `showStreak` is off).

**Files changed:**
- `src/api/routes/state.js` — `streak` computed from `gameRepo.getStreak(now)` (removed stale `streak_cache` lookup)
- `src/api/routes/puzzles.js` — accepts optional `gameRepo`; calls `gameRepo.recordActivity` after `saveReview`
- `src/api/ws/handlers.js` — `finishGame` calls `gameRepo.recordActivity` with `played_at` timestamp
- `src/server.js` — passes `gameRepo` to `puzzlesRouter`
- `public/stats.html` — `#streak-tile` stat tile added
- `public/js/stats.js` — `renderStreakTile(state)` renders streak tile
- `tests/unit/api-routes.test.js` — 3 new tests; `buildApp` updated to wire `gameRepo` to `puzzlesRouter`

**DoD:** 3 new tests; 1334 total; 90.81% branch coverage; `make verify` clean.

## Phase 34 — Activity history sparkline on streak tile (Complete — 2026-08-31)

**Goal:** Render a 30-day activity bar chart on the dashboard streak tile so players can see their practice rhythm at a glance.

**Design:** `getActivityHistory(limitDays=30)` returns sorted `[{day, games, reviews}]` from the `activity` table. `GET /api/state` includes `activityHistory`. `drawActivityBars(canvas, values, opts)` in `chart.js` draws one vertical bar per day, height proportional to review count, filled with accent colour for active days and dimmed for zero days (minimum 2 px so inactive days are still visible). Dashboard streak tile feeds `activityHistory.map(h => h.reviews)` to the canvas.

**Files changed:**
- `src/ports/repositories.js` — JSDoc for `GameRepository#getActivityHistory`
- `src/adapters/sqlite/repositories.js` — `getActivityHistory` SQL query (DESC LIMIT, then reversed)
- `src/adapters/memory/repositories.js` — in-memory `getActivityHistory`
- `src/api/routes/state.js` — `activityHistory` added to response
- `public/js/lib/chart.js` — `drawActivityBars` exported
- `public/js/dashboard.js` — streak tile uses `drawActivityBars` on the spark-streak canvas
- `tests/unit/api-routes.test.js` — 2 new tests: history array populated; empty array on fresh DB

**DoD:** 2 new tests; 1336 total; 90.68% branch coverage; `make verify` clean.

## Phase 35 — Activity backfill for pre-Phase-33 data (Complete — 2026-08-31)

**Goal:** Retroactively populate the `activity` table from existing `reviews` and `games` rows so that users who played and drilled before Phase 33 see a real streak and sparkline rather than starting from zero.

**Design:** One-time backfill in `applySchema` (runs on every startup). Uses the same 04:00 local-time day boundary as `recordActivity`. Two `INSERT … ON CONFLICT DO UPDATE` statements aggregate historical reviews and finished games into `activity`. Guarded by a `settings.activity_backfill_v1` sentinel written only when actual data is found — fresh empty DBs do not set the sentinel, so the backfill will run again once real data exists. The entire block is wrapped in `try/catch` so partial migration schemas in other test suites do not break unrelated tests.

**Files changed:**
- `src/adapters/sqlite/schema.js` — backfill block appended after `applySchema` migrations; sentinel check + two aggregating `INSERT … ON CONFLICT` statements
- `tests/unit/migration-activity-backfill.test.js` — 4 new tests: review backfill, game backfill, idempotency, post-backfill streak correctness

**DoD:** 4 new tests; 1340 total; 90.7% branch coverage; `make verify` clean.

## Phase 36 — Document phases 27–35 in feature_steps.md (Complete — 2026-08-31)

**Goal:** Catch up the `feature_steps.md` process log, which was 9 phases behind (phases 27–35 undocumented).

**Files changed:**
- `docs/features/pawnbook/feature_steps.md` — phases 27–35 appended

**DoD:** `make verify` clean (docs-only change; test count and coverage unchanged).
