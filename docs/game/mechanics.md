# Mechanics

Each mechanic maps to one or more functional requirements in `feature_spec.md`.

## Rating (FR-ELO)

Standard Elo against the roster's known ratings.

```
expected = 1 / (1 + 10^((oppElo - myElo) / 400))
newElo   = myElo + K * (score - expected)     score ∈ {1, 0.5, 0}
K = 40 if gamesPlayed < 15  (provisional)
    20 if myElo < 2100
    10 otherwise
```

Rating difference clamped to **±400** before computing expected (`ELO_DIFF_CLAMP`). Only ranked games with a non-null `opponent_elo` move the rating.

Drawfish: `opponent_elo = NULL`, forced unranked. Standard rules adjudicate; stalemate is a draw.

## Findability gate (FR-PUZZLE)

A mistake becomes a puzzle only if `findability >= FINDABILITY_MIN` (default 0.04), where:

```
findability = P_maia(stockfish_best_move)    // at PolicyTemperature=1.0
```

Below the threshold: tagged `engine_only`, shown in review, never drilled. This stops the queue filling with moves no human at your rating would find.

**Temptation**: `P_maia(played_move)` — high value → tagged `common_trap`, the highest-value drills.

## One retry, then teach (FR-DRILL)

Wrong → "One more try" (no answer shown). Second wrong → reveal the best move, line, and eval swing. Correct → show the line, auto-advance.

## Hint → `Again` (FR-DRILL)

A hint names the piece to move. It forces FSRS rating `Again`, not `Hard`. A hint means you did not retrieve; `Hard` would let the interval keep growing, filling the queue with cards you can only solve with help.

## Near-miss acceptance (FR-DRILL)

Any move within `NEAR_MISS_WIN_PTS` (2.0 win% points) of best is accepted as correct — all moves stored in `accepted_moves_json`, not just one runner-up.

## Follow-up requirement (FR-DRILL)

After a correct first move, the continuation 1–2 plies deep from the stored `pv` must be found.

| Outcome | FSRS rating |
|---|---|
| Wrong or hint used | `Again` |
| Correct, correct follow-up, < 6 s total, first try | `Easy` |
| Correct, correct follow-up | `Good` |
| Correct, **wrong follow-up** | `Hard` |
| No stored follow-up (mate / short pv) | as if correct, no follow-up asked |

## Behavioural FSRS rating (FR-DRILL)

Inferred from correctness, timing, and hint use. Self-rating is unreliable and adds friction; behaviour is honest and free.

## Post-game quiz → not a review (FR-QUIZ)

The quiz fires while the game is fresh. It writes `practice = 1`, `rating = NULL`, and does **not** call the scheduler. Card created with `due = tomorrow`. The first spaced review is the honest measurement.

## Streak (FR-STATS)

Consecutive local calendar days (04:00 boundary) with at least one game or review. Derived from `activity`, never stored as a counter. Can be hidden via `settings.show_streak`.

## Queue economy (FR-DRILL)

- `PUZZLES_PER_GAME_MAX = 6` — caps extraction per game
- `DUE_SOFT_CAP = 40` — badge shows `40+` above this; batches ordered by `instructiveness × overdue`
- Graduation: `reps >= 5`, no lapses, `interval > 180d` → `graduated = true`, leaves the active queue
- Empty queue: phrased as a win state, not an error

## Time control (FR-CLOCK)

Optional, untimed by default. Offered: `10+0 · 5+3 · 3+2`. Server-authoritative via the `Clock` port. Fischer increment applied after the move. Clock pauses on disconnect. Flag-fall → `termination = 'timeout'`.
