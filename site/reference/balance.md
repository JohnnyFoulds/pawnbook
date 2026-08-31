---
title: Balance Parameters
---

# Balance Parameters

All tuning parameters live in `src/shared/balance.js`. A regression test enforces that every value here matches the source — if the values diverge the test suite will fail loudly.

::: info Changing a parameter
A balance parameter change requires **two** commits: a code change to `src/shared/balance.js` and a documentation commit (`docs(balance): ...`) updating `docs/game/balance.md`. Silent edits are considered a bug.
:::

---

## Move classification

These thresholds determine how a move is labelled based on the win-percentage loss it caused.

| Parameter | Default | Description |
|---|---|---|
| `BLUNDER_WIN_PTS` | `30` | Win% loss ≥ 30 → **Blunder** (`??`) |
| `MISTAKE_WIN_PTS` | `20` | Win% loss ≥ 20 → **Mistake** (`?`) |
| `INACCURACY_WIN_PTS` | `10` | Win% loss ≥ 10 → **Inaccuracy** (`?!`) |
| `GREAT_CP_MAX` | `25` | Centipawn loss < 25 AND no win% loss → **Great** (`!`) |
| `GOOD_CP_MAX` | `50` | Centipawn loss 25–49 AND no win% loss → **Good** |
| `NEAR_MISS_WIN_PTS` | `3` | Moves within 3 win% of the best move are included in `acceptedMovesJson` |

Moves below the inaccuracy threshold are **OK** if centipawn loss ≥ 50, **Good** if < 50, **Great** if < 25, **Best** if cp_loss ≤ 0.

---

## Puzzle extraction

| Parameter | Default | Description |
|---|---|---|
| `FINDABILITY_MIN` | `0.04` | Minimum Maia probability of finding the best move. Below this → tagged `engine_only` (shown in review, not added to drill queue) |
| `POLICY_TEMPERATURE` | `1.0` | Temperature used for Maia policy probes. 1.0 = unmodified probability distribution |
| `PUZZLES_PER_GAME_MAX` | `6` | Maximum drillable puzzles extracted per game, ranked by instructiveness |

---

## FSRS drill scheduling

| Parameter | Default | Description |
|---|---|---|
| `DRILL_BATCH` | `10` | Maximum cards served per drill session |
| `DUE_SOFT_CAP` | `40` | Above this many due cards, the queue sort changes: opening cards first, then by instructiveness × overdue factor |
| `TARGET_RETENTION` | `0.90` | FSRS target recall probability at the scheduled review date |
| `RATING_FAST_MS` | `6000` | Correct on first try in < 6 s → **Easy** |
| `RATING_SLOW_MS` | `25000` | Correct in > 25 s → **Hard** |
| `GRADUATE_REPS` | `5` | Minimum review count for graduation eligibility |
| `GRADUATE_INTERVAL_D` | `180` | Minimum scheduled interval in days for graduation |
| `SUSPECT_RECALL_MS` | `2000` | Correct in < 2 s on the first spaced review → `suspect_recall` flag |

**Rating inference** (the server assigns the rating; the player never picks it):

| Condition | Rating |
|---|---|
| Wrong, or hint used | Again |
| Correct followup wrong | Hard |
| Correct, time > 25 s | Hard |
| Correct, time ≤ 25 s | Good |
| Correct, time < 6 s, first try | Easy |

---

## Elo rating

| Parameter | Default | Description |
|---|---|---|
| `ELO_STARTING` | `1200` | Starting Elo for new players |
| `ELO_FLOOR` | `100` | Rating never drops below this value |
| `ELO_DIFF_CLAMP` | `400` | Maximum Elo difference used in expected-score calculation (FIDE standard) |
| `ELO_K_PROVISIONAL` | `40` | K-factor during the first `ELO_K_PROVISIONAL_GAMES` games |
| `ELO_K_PROVISIONAL_GAMES` | `15` | Number of games in the provisional period |
| `ELO_K_MID` | `20` | K-factor when Elo < `ELO_THRESHOLD_HIGH` |
| `ELO_K_HIGH` | `10` | K-factor when Elo ≥ `ELO_THRESHOLD_HIGH` |
| `ELO_THRESHOLD_HIGH` | `2100` | Elo threshold for switching to the high K-factor |

Elo updates apply only to ranked games. Games where the coach fires an alert are automatically set to unranked. Drawfish games are always unranked.

---

## Analysis pipeline

| Parameter | Default | Description |
|---|---|---|
| `INCREMENTAL_DEPTH` | `20` | Stockfish search depth for pre-eval during play |
| `INCREMENTAL_MAX_QUEUE` | `5` | When the pre-eval queue exceeds this depth, the engine switches to depth-18 catch-up mode |

Post-game pass depths are fixed in the pipeline: pass 1 = depth 18 (depth 20 for pre-evals already cached), pass 2 = depth 22 MultiPV-3, pass 3 = Maia policy probe (`go nodes 2`).

---

## Playing strength estimation

The strength estimator uses a calibrated linear model over Regan-Haworth scaled error. See [Strength Estimation](/research/strength-estimation) for the full methodology.

| Parameter | Default | Description |
|---|---|---|
| `STRENGTH_ANCHOR_ELO` | `1600` | Calibration anchor point: Maia-1600's Elo rating |
| `STRENGTH_ANCHOR_ASE` | `0.2638` | Calibration anchor point: Maia-1600's measured mean scaled error |
| `STRENGTH_ELO_PER_ASE` | `6500` | Linear slope: Elo units per unit increase in mean scaled error |
| `STRENGTH_CP_CAP` | `300` | Centipawn loss is capped at this value before applying the log transform |
| `STRENGTH_DECIDED_CP` | `600` | Positions where `|cp_white| > 600` are excluded from strength sampling (game already decided) |
| `STRENGTH_MIN_PLIES` | `12` | Minimum eligible plies in a game for a valid strength sample |
| `STRENGTH_ROLLING_N` | `10` | Number of games in the inverse-variance weighted rolling aggregate |

The honest per-game noise floor is ±250–300 Elo at one standard error. The rolling aggregate reduces this substantially over multiple games.

Coefficients are version-tracked in `calibration/strength-model.json`. Running `scripts/refit-strength.js` produces a new coefficient set from ≥ 20 strength samples spanning ≥ 3 distinct Elo ratings.

---

## Repertoire

| Parameter | Default | Description |
|---|---|---|
| `REP_PLY_MAX` | `30` | Coach is silent beyond this ply (half-moves from the start) |
| `REP_CONFIRM_OBS` | `2` | Observations of a move needed before it graduates from `candidate` to `canonical` |
| `REP_ADMIT_WIN_PTS` | `10` | Win% loss below this → move admitted (gate 1 passes) |
| `REP_QUARANTINE_WIN_PTS` | `20` | Win% loss in [10, 20) → move quarantined rather than refused |
| `REP_MIN_ABS_WIN_PCT` | `35` | Gate 3: win% after the move must reach this level when the best available move can (absolute floor) |
| `REP_LINE_BUDGET_WIN_PTS` | `20` | Gate 4: cumulative win% loss along the line must not exceed this (from Lincke 2001) |
| `REP_RECENCY_HALFLIFE_DAYS` | `120` | Half-life for the recency-weighted canonical vote |
| `REP_BOOTSTRAP_CONFIRMED_MIN` | `20` | Minimum confirmed canonical nodes before the coach begins alerting |
| `REP_ALERTS_PER_GAME_MAX` | `3` | Maximum coach alerts per game before the coach falls silent |
| `REP_ALERT_TIMEOUT_SEC` | `60` | Seconds the player has to respond to an alert before it auto-resolves |
| `REP_AUTO_PROMOTE` | `true` | Automatically promote challengers when the evidence rules are satisfied |
| `REP_CHALLENGE_ENGINE_TOL` | `3` | Win% tolerance for classifying engine signal as "neutral" in challenge rules |
| `REP_CHALLENGE_ENGINE_CLEAR` | `2` | Win% advantage for an "engine-clear" promotion (challenge rule 2) |
| `REP_AUDIT_DEPTH` | `22` | Stockfish depth for A/B engine evaluations during challenge audits |
| `REP_REVERSAL_SUPPRESS_ENCOUNTERS` | `8` | Encounters a reversed challenger is suppressed before being re-eligible |

### Soundness gates

The four gates are evaluated in order. First failure determines the verdict:

1. **Forced mate** — If the position has a forced mate, the move is refused regardless of win%.
2. **Per-move cost** (`REP_QUARANTINE_WIN_PTS`) — Win% loss ≥ 20 → refused. Win% loss in [10, 20) → quarantined.
3. **Absolute floor** (`REP_MIN_ABS_WIN_PCT`) — After the move, win% must be reachable to 35% if any available move can reach 35%.
4. **Line budget** (`REP_LINE_BUDGET_WIN_PTS`) — Cumulative win% loss along the full line must not exceed 20 points.
