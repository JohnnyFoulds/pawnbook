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

## Playing-strength estimate (FR-GRADE-6–11)

After every analysed game, pawnbook estimates the Elo at which each side *played* in that game, using Regan & Haworth's scaled-error statistic (AAAI 2011) computed from pass-1 engine evaluations. The full research record is in `docs/research/strength-estimation.md`.

**The formula.** For each side, eligible plies are those where the mover had more than one legal move, the pre-move eval is not a mate score, and `|cpWhite| ≤ STRENGTH_DECIDED_CP` (excludes dead positions that dominate ACPL). For each eligible ply:

```
scaledLoss = ln(1 + min(cpLoss, STRENGTH_CP_CAP) / 100)
```

`ase` (average scaled error) is the mean over eligible plies. The estimate:

```
strength = STRENGTH_ANCHOR_ELO − STRENGTH_ELO_PER_ASE × (ase − STRENGTH_ANCHOR_ASE)
```

clamped to `[STRENGTH_ELO_MIN, STRENGTH_ELO_MAX]`. Null when fewer than `STRENGTH_MIN_PLIES` eligible plies exist.

**Standard error.** Reported alongside each estimate as one SE:

```
se = STRENGTH_ELO_PER_ASE × sd / √n
```

where `sd` is the sample standard deviation of per-ply `scaledLoss` (0 when `n < 2`). The `±` shown on the review page is **one standard error (≈ 68% coverage)**, not a confidence interval. A flawless game yields `se = 0`, which is arithmetic, not certainty.

**Expected accuracy.** Per-game error is inherently ±250–300 Elo — a property of the problem, not a defect. The 2014 Kaggle *Finding Elo* competition (157 teams, Stockfish at 1 s/move) achieved ~222 Elo residual SD using only supplied data. Any test asserting a tighter single-game bound will flake.

**The rolling aggregate** (last `STRENGTH_ROLLING_N` games) uses inverse-variance weighting and is a more reliable figure than any individual estimate. It assumes a fixed recent strength and therefore lags an improving player.

**Eligibility symmetry.** Both sides' eligible plies are a disjoint partition of the game (`mover === side` makes them disjoint by construction) evaluated under identical criteria on the same White-POV series. Neither side gets a systematically easier bar; the two numbers are directly comparable.

**Calibration.** Coefficients are versioned in `calibration/strength-model.json` and read from `src/shared/balance.js` at runtime. No domain code reads the JSON. Re-fit via `scripts/refit-strength.js` once ≥ 20 samples spanning ≥ 3 distinct opponent ratings are available. The anchor is tied to the current pass-1 search depth; a depth change warrants a refit.

**Known limitations (not to be tuned away):**
- A heavily-booked opening inflates the estimate — opening plies with zero loss are counted, biasing `ase` low.
- A heavily won endgame has most plies filtered by `STRENGTH_DECIDED_CP`, reducing `n` and producing `—`.
- Long won endgames may produce a null estimate for the winner even when `n` is reasonable.

## Time control (FR-CLOCK)

Optional, untimed by default. Offered: `10+0 · 5+3 · 3+2`. Server-authoritative via the `Clock` port. Fischer increment applied after the move. Clock pauses on disconnect. Flag-fall → `termination = 'timeout'`.
