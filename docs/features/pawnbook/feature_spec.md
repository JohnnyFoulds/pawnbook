# Feature spec — pawnbook

**Status:** Phase 0 draft  
**Authority:** This document is normative. Where it contradicts `initial_idea.md`, the spec wins.

RFC 2119 vocabulary is used throughout: MUST, SHOULD, MAY, MUST NOT, SHOULD NOT.

---

## R — Requirements

### FR-PLAY: Game session

- FR-PLAY-1: The system MUST support games against every opponent in the roster.
- FR-PLAY-2: The system MUST enforce legal moves via chess.js; an illegal move MUST be rejected with `IllegalMoveError`.
- FR-PLAY-3: The system MUST support White, Black, or Random colour selection.
- FR-PLAY-4: The system MUST support a ranked toggle, default on. Drawfish MUST be forced unranked.
- FR-PLAY-5: The system MUST support optional time control (untimed default; 10+0, 5+3, 3+2).
- FR-PLAY-6: The system MUST persist moves to `game_moves` as each is accepted, enabling resume.
- FR-PLAY-7: The system MUST support resuming an in-progress game after a disconnect.
- FR-PLAY-8: A game that is never resumed MUST be marked `abandoned`.
- FR-PLAY-9: The system MUST support resignation.
- FR-PLAY-10: The system MUST detect and record all draw conditions (stalemate, threefold, fifty-move, insufficient material) via chess.js.
- FR-PLAY-11: A ranked game MUST NOT expose eval or hints; `HintNotAllowedError` MUST be raised.

### FR-ROSTER: Opponent roster

- FR-ROSTER-1: The roster MUST be a static table with an `optional` flag per opponent.
- FR-ROSTER-2: A missing required weight file MUST throw `WeightsMissingError` naming the file at startup.
- FR-ROSTER-3: A missing optional weight file MUST log `warn` once and exclude the opponent from `GET /api/opponents`.
- FR-ROSTER-4: Drawfish MUST have `opponent_elo = NULL` and `ranked = false` with no override.

### FR-ELO: Rating

- FR-ELO-1: The system MUST compute Elo using the standard formula with K 40/20/10.
- FR-ELO-2: The rating difference fed to `expected` MUST be clamped to ±400.
- FR-ELO-3: Only ranked games with non-null `opponent_elo` MUST update `elo_history`.
- FR-ELO-4: The Elo update MUST write `elo_history` and `settings.elo` in one transaction.
- FR-ELO-5: On startup the system MUST assert `settings.elo === last(elo_history).elo`, log `error` and re-derive from history if not.

### FR-ANALYSE: Analysis pipeline

- FR-ANALYSE-1: Analysis MUST run automatically after a game ends.
- FR-ANALYSE-2: Post-game pass 1 MUST evaluate every ply that has no pre-existing `move_evals` row, at depth 18, `Threads=6`, `Hash=1024`, `MultiPV=1`.
- FR-ANALYSE-3: Pass 2 MUST re-run candidate mistakes at depth 22 with `MultiPV=3`.
- FR-ANALYSE-4: Pass 3 MUST probe the Maia model nearest the player's Elo using `classic` mode, `VerboseMoveStats=true`, `PolicyTemperature=1.0`, `go nodes 2`.
- FR-ANALYSE-5: Analysis MUST stream progress over WebSocket as `analysis_progress` events.
- FR-ANALYSE-6: `analysis_progress` events MUST include `phase` and a monotone `overallPct`.
- FR-ANALYSE-7: Both sides' plies MUST be graded (mover's-POV normalised); puzzle generation is restricted to player plies only.
- FR-ANALYSE-8: A failed analysis MUST set `analysis_state = 'failed'` and MUST NOT throw to the caller.
- FR-ANALYSE-9: After each move is accepted during an active game, the server MUST submit a pass-1 evaluation for the resulting FEN to the background analysis queue (incremental pre-evaluation).
- FR-ANALYSE-10: Incremental pass-1 evaluations MUST use depth 20 when the analysis queue depth is ≤ `INCREMENTAL_MAX_QUEUE` (default 5); depth 18 otherwise (catch-up mode).
- FR-ANALYSE-11: The post-game pass-1 step MUST skip any ply for which a `move_evals` row already exists for that `(game_id, ply)`.
- FR-ANALYSE-12: Incremental pre-evaluation results MUST be stored in `move_evals` with the same schema as post-game pass-1 results; they MUST be usable by pass-2 without re-evaluation.
- FR-ANALYSE-13: If a game is abandoned or resigned, any pre-evaluated `move_evals` rows MUST be retained and used when post-game analysis runs.

### FR-GRADE: Move grading

- FR-GRADE-1: The system MUST use the lichess winningChances formula: `2 / (1 + exp(-0.00368208 * cp)) - 1`.
- FR-GRADE-2: All thresholds MUST be in win% POINTS (0–100): Blunder ≥ 30, Mistake ≥ 20, Inaccuracy ≥ 10.
- FR-GRADE-3: The sub-inaccuracy tiers (Great < 25cp, Good < 50cp) MUST use centipawn loss.
- FR-GRADE-4: White's first move MUST use a synthetic `+0.15` prior eval.
- FR-GRADE-5: Losing or missing a forced mate MUST be classified Blunder, downgraded to Mistake if the position was already below ∓700cp.

### FR-PUZZLE: Puzzle selection

- FR-PUZZLE-1: A position MUST become a puzzle only if `findability >= FINDABILITY_MIN` (default 0.04).
- FR-PUZZLE-2: Positions below the threshold MUST be tagged `engine_only`.
- FR-PUZZLE-3: High `temptation` MUST tag the puzzle `common_trap`.
- FR-PUZZLE-4: Puzzles per game MUST be capped at `PUZZLES_PER_GAME_MAX` (default 6), ranked by `instructiveness`.
- FR-PUZZLE-5: `accepted_moves_json` MUST store all moves within `NEAR_MISS_WIN_PTS` (default 2.0) of best.
- FR-PUZZLE-6: A repeated FEN MUST bump `times_seen` instead of inserting a duplicate.
- FR-PUZZLE-7: `phase` MUST be derived as: endgame if non-king non-pawn material ≤ 13; else opening if `ply ≤ 20` with castling rights or undeveloped back rank; else middlegame.
- FR-PUZZLE-8: `maia_model`, `policy_temperature`, and `elo_at_creation` MUST be stored with the puzzle.
- FR-PUZZLE-9: Puzzles from timed games MUST be tagged `was_timed`.

### FR-QUIZ: Post-game quiz

- FR-QUIZ-1: The quiz MUST fire after a game ends while analysis is running.
- FR-QUIZ-2: A quiz attempt MUST write `reviews.practice = 1`, `rating = NULL`, and MUST NOT call the scheduler.
- FR-QUIZ-3: The card MUST be created with `due = tomorrow` regardless of quiz outcome.

### FR-DRILL: Drill session

- FR-DRILL-1: Drill MUST serve cards from `fsrs_cards` where `due <= now()` and `graduated = false`.
- FR-DRILL-2: The system MUST allow one retry before revealing the answer.
- FR-DRILL-3: A hint MUST name the piece to move and MUST force FSRS rating `Again`.
- FR-DRILL-4: Any move in `accepted_moves_json` MUST be accepted as correct.
- FR-DRILL-5: After a correct first move the follow-up MUST be requested (unless `pv` is too short).
- FR-DRILL-6: Rating MUST be inferred by the server from `{move, msTaken, hintUsed, attemptNo}`.
- FR-DRILL-7: A client MUST NOT send `correct` or `rating` in the attempt payload.
- FR-DRILL-8: Drill-ahead on an empty queue MUST write `practice = 1` and MUST NOT schedule.
- FR-DRILL-9: Sessions MUST run in batches of `DRILL_BATCH` (default 10).

### FR-CLOCK: Time control

- FR-CLOCK-1: The server MUST be the sole clock authority.
- FR-CLOCK-2: Untimed games MUST store `NULL` in `time_control_*` and MUST NOT emit `clock_update`.
- FR-CLOCK-3: Increment MUST be applied after the move is accepted (Fischer).
- FR-CLOCK-4: Flag-fall MUST end the game with `termination = 'timeout'` and the win to the opponent.
- FR-CLOCK-5: The clock MUST pause on socket close and resume on `resume`.

### FR-STORE: Persistence

- FR-STORE-1: The system MUST use a single SQLite file at `/app/data/chess.db`.
- FR-STORE-2: The schema MUST be idempotent.
- FR-STORE-3: `termination` MUST be a closed enum: `checkmate | resignation | stalemate | threefold | fifty_move | insufficient_material | timeout | abandoned`.
- FR-STORE-4: `analysis_state` MUST be `pending | running | done | failed`.
- FR-STORE-5: `games.status` MUST be `in_progress | finished | abandoned`.
- FR-STORE-6: `activity` rows MUST use a 04:00 local day boundary.
- FR-STORE-7: The streak MUST be derived from `activity`, never stored as a counter.

### FR-STATS: Statistics

- FR-STATS-1: The dashboard MUST show: ELO (hero figure), puzzles-due (stat tile), streak (stat tile, hideable).
- FR-STATS-2: The stats page MUST show: rating over time (line), accuracy trend (line), results (stat tiles), mistakes by phase (bar), queue health meter (`due / DUE_SOFT_CAP`), retired-mistakes tile.
- FR-STATS-3: A retired-mistakes stat tile MUST be present on the stats page.
- FR-STATS-4: `settings.show_streak` (default 1) MUST be honoured by both clients.

### FR-ENGINE: Engine management

- FR-ENGINE-1: One persistent Stockfish MUST serve analysis via a serialised job queue.
- FR-ENGINE-2: One engine instance per active game MUST be spawned and killed on socket close.
- FR-ENGINE-3: Engine spawn MUST retry 3 times with exponential backoff + jitter before raising.
- FR-ENGINE-4: `ENGINE_MODE=native|container` MUST switch binary paths at the composition root.
- FR-ENGINE-5: The game engine (requestMove) MUST be configured with `Threads=1`, `Hash=16`; strength-limited SF opponents and Maia policy evals are single-threaded by design.
- FR-ENGINE-6: The analysis SF MUST use `Threads=4`, `Hash=512` while a game is in progress (incremental phase), and MUST reconfigure to `Threads=6`, `Hash=1024` once the game ends (post-game phase). Reconfiguration MUST use `setoption` before the first eval of each phase.
- FR-ENGINE-7: The analysis engine and the game engine MUST be separate OS processes and MUST NOT share a UCI client instance.

---

## I — Interfaces

See `src/schemas/` for executable Zod definitions.

### WebSocket messages

**Client → server:**
- `new_game { opponentId, color, ranked, timeControl }` — `timeControl: null | { initialSec, incSec }`
- `move { uci }`
- `resign`
- `hint`
- `resume { gameId }`

**Server → client:**
- `game_started { gameId, fen, youPlay, legalMoves: [{uci, san}], clock? }`
- `engine_move { uci, san, fen, legalMoves, check, clock?, gameOver? }`
- `hint_result { pieceSquare }`
- `clock_update { whiteMs, blackMs, turn }` — only when `timeControl != null`
- `game_over { result, termination, eloBefore, eloAfter }`
- `analysis_progress { gameId, phase, done, total, overallPct }`
- `analysis_done { gameId }`
- `error { type: 'error', error_code, message, detail }`

### REST endpoints

```
GET  /api/opponents
GET  /api/state
GET  /api/games
GET  /api/games/:id/review
GET  /api/games/:id/quiz
GET  /api/puzzles/due
POST /api/puzzles/:id/attempt   { move, msTaken, hintUsed, attemptNo, phase }
GET  /api/stats
```

---

## P — Preconditions

- P-1: Engines must pass `scripts/smoke.sh` before a game can start.
- P-2: All required weight files must be present; `make setup` is a prerequisite.
- P-3: SQLite schema migration must complete at startup before any request is served.

---

## Q — Postconditions and invariants

- Q-1: `elo_history` is append-only; no row is ever deleted.
- Q-2: A game's `pgn` MUST be derivable from `game_moves` alone.
- Q-3: `puzzles.fen` is UNIQUE; duplicate FENs are deduped.
- Q-4: `reviews.practice = 1` rows are never passed to the FSRS scheduler.
- Q-5: `git log --all --numstat | grep -c '\.pb\.gz'` returns 0 (no weights in history).
- Q-6: `maia_model` and `policy_temperature` are stored with every puzzle.

---

## N — Non-functional requirements

| ID | Bound | Derivation |
|---|---|---|
| NFR-A1 | Post-game pass 1: ≤ 2.0 s/position | Threads=6, Hash=1024, depth 18; 81 positions × 2.0 = 162 s (cold path only) |
| NFR-A1b | Incremental pass 1: ≤ 3.5 s/position | Threads=4, Hash=512, depth 20; tighter threads, deeper depth, ample wall-clock during play |
| NFR-A2 | Pass 2: ≤ 7.0 s/candidate | Threads=6, Hash=1024, depth 22, MultiPV=3; ≤ 8 candidates × 7.0 = 56 s |
| NFR-A3 | Maia probe: ≤ 0.5 s/candidate | 8 × 0.5 = 4 s |
| NFR-A4 | 40-move game, cold path (no pre-evals): ≤ 4 min | 162 + 56 + 4 = 222 s ≈ 3.7 min |
| NFR-A5 | 40-move game, pre-eval path (all plies cached): ≤ 70 s | pass 1 ≈ 0 s + pass 2 ≤ 56 s + Maia ≤ 4 s + overhead ≤ 10 s |
| NFR-ENG | UCI handshake timeout | 10 s |
| NFR-WS | Reconnect backoff cap | 30 s |
| NFR-TUI | Full board frame redraw | ≤ 16 ms |
| NFR-IMG | Docker image size | ≤ 850 MB |
| NFR-COV | Branch coverage | ≥ 90% over declared scope |

**Resource budget (10-core M4, 8 GB RAM):**

| Engine | Process key | Threads | Hash | Phase |
|---|---|---|---|---|
| Game (Maia/SF-limited) | `maia-N` / `stockfish` | 1 | 16 MB | during play |
| Analysis SF (incremental) | `sf-analysis` | 4 | 512 MB | during play |
| Analysis SF (post-game) | `sf-analysis` (reconfigured) | 6 | 1024 MB | post-game |
| Maia analysis (findability) | `maia-analysis-N` | 2 | 32 MB | post-game |

Cores accounted for during play: 1 (game) + 4 (analysis) + 2 (OS/Node) = 7 of 10 — 3 free.
Cores post-game: 6 (analysis SF) + 2 (Maia) + 2 (OS/Node) = 10 — fully utilised.
RAM: 16 + 512 + 32 = 560 MB peak; post-game 1024 + 32 = 1056 MB — well within 8 GB.

### Coverage scope

| Path | In coverage? |
|---|---|
| `src/domain/**`, `src/adapters/**`, `src/api/**`, `src/shared/**` | Yes — the gate |
| `src/server.js`, `src/telemetry.js` | Excluded (composition/wiring) |
| `tui/**`, `public/**` | Excluded from percentage; tested behaviourally |
| `tests/**`, `scripts/**` | Excluded |

Changing the exclusion list requires a `docs(...)` commit.
