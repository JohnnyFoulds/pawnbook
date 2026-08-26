# Feature steps — pawnbook

Every test name below is written before implementation. Tests for future phases use `test.fails(...)` with `await import()` inside the body.

---

## Phase 0 — Spec (no code)

**DoD:** §9 completeness checklist passes. Every FR is MUST/SHOULD/MAY, every error named with its code and HTTP status, every NFR has a measurable bound, every requirement in `initial_idea.md` either maps to a spec entry or is explicitly out of scope.

Exit gate: self-conducted production readiness review (`D1…Dn` findings resolved).

---

## Phase 1 — Scaffold, errors, config

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

**Branch:** `feat/phase-4-engine`  
**Files:** `src/adapters/engine/uci-engine-client.js`, `src/adapters/engine/pool.js`, `src/adapters/engine/scripted-engine-client.js`, `scripts/record-fixtures.sh`

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

**Branch:** `feat/phase-7-puzzles`  
**Files:** `src/domain/puzzles/select.js`, `src/domain/puzzles/dedupe.js`, `src/domain/puzzles/attempt.js`, `src/domain/review/queue.js`, `src/domain/review/rating.js`, `src/adapters/scheduler/`

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

**Branch:** `feat/phase-8-docker`  
**Files:** `Dockerfile`, `docker-compose.yml`, `scripts/smoke.sh`, `scripts/fetch-weights.sh`

Gated by `scripts/smoke.sh` passing in-container plus the verification section in `initial_idea.md` for engine checks.

---

## Phase 9 — Web UI

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

**Branch:** `docs/phase-11-review`

8-section review of the implementation, findings labelled `A-1…A-n`. `implementation_plan.md` archived. `feature_spec.md` stays living.
