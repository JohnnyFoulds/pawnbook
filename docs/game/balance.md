# Balance parameters

All parameters live in `src/shared/balance.js`. A balance change requires a `docs(balance):` commit plus a config change. A regression test asserts the two files agree.

## Tuning table

| Parameter | Default | Range | If wrong you'll see |
|---|---|---|---|
| `FINDABILITY_MIN` | 0.04 | 0.01–0.15 | Low: queue fills with moves you'd never find. High: barely any puzzles from a bad game |
| `POLICY_TEMPERATURE` | 1.0 | 0.8–1.359 | Silently rescales every findability; FINDABILITY_MIN is meaningless without it. lc0's own default is 1.359 |
| `PUZZLES_PER_GAME_MAX` | 6 | 3–10 | High: one disaster game floods the week. Low: real mistakes go undrilled |
| `NEAR_MISS_WIN_PTS` | 2.0 | 1.0–5.0 | Low: correct moves marked wrong. High: sloppy moves pass |
| `RATING_FAST_MS` | 6000 | 3000–10000 | Easy firing on lucky guesses, or never firing at all |
| `RATING_SLOW_MS` | 25000 | 15000–45000 | Everything rated Hard, so intervals never grow |
| `SUSPECT_RECALL_MS` | 2000 | 1000–4000 | Never flags, or flags every easy card |
| `BLUNDER_WIN_PTS` | 30 | lichess default | Deviating breaks comparability |
| `MISTAKE_WIN_PTS` | 20 | lichess default | Deviating breaks comparability |
| `INACCURACY_WIN_PTS` | 10 | lichess default | Deviating breaks comparability |
| `GREAT_CP_MAX` | 25 | — | Sub-inaccuracy tier boundary wrong; cp loss used here by design (win% points too coarse at 0–10) |
| `GOOD_CP_MAX` | 50 | — | Sub-inaccuracy tier boundary wrong |
| `ELO_DIFF_CLAMP` | 400 | 300–800 | Unclamped, sf-max becomes a free-roll |
| `ELO_FLOOR` | 100 | — | Rating can be driven below a usable floor by repeated losses |
| `K_PROVISIONAL` | 40 | standard | Rating too jumpy in first 15 games |
| `K_MID` | 20 | standard | Rating too sticky |
| `K_HIGH` | 10 | standard | Rating too sticky at top |
| `K_PROVISIONAL_GAMES` | 15 | standard | Wrong K-factor applied throughout the calibration window |
| `K_MID_ELO_MAX` | 2100 | standard | K drops to 10 too early or too late |
| `DRILL_BATCH` | 10 | 5–20 | Sessions that never end, or end before warming up |
| `DUE_SOFT_CAP` | 40 | 20–100 | Queue feels like debt |
| `TARGET_RETENTION` | 0.90 | 0.80–0.95 | High: same puzzles constantly. Low: things fall out of memory |
| `GRADUATE_REPS` | 5 | 3–8 | Cards never retire |
| `GRADUATE_INTERVAL_D` | 180 | 90–365 | Cards retire while still shaky |
| `ENDGAME_MATERIAL_MAX` | 13 | — | Phase classification wrong |
| `OPENING_PLY_MAX` | 20 | — | Phase classification wrong |
| `INCREMENTAL_MAX_QUEUE` | 5 | 2–10 | Low: analysis engine idles between moves at max depth. High: queue piles up and depth falls back to 18 too often |
| `INCREMENTAL_DEPTH` | 20 | 18–22 | Low: no benefit over post-game. High: queue piles up faster than moves arrive in fast games |
| `TIME_CONTROLS` | `[null, 10+0, 5+3, 3+2]` | — | The offered set; `null` (untimed) is the default and the training default |

## Playing strength

| Parameter | Default | Notes |
|---|---|---|
| `STRENGTH_ANCHOR_ELO` | 1600 | Elo value the anchor `ase` maps to; fitted locally against maia-1600 games |
| `STRENGTH_ANCHOR_ASE` | 0.2638 | Mean scaled error at the anchor Elo; v1 calibration from two maia-1600 games (2026-08-28) |
| `STRENGTH_ELO_PER_ASE` | 6500 | Elo per unit scaled error; local fit — Regan & Haworth 2011 slope (13034) was too steep because Regan's `ada` uses all-legal-moves while our `ase` uses best-vs-played only. Will be refined at ≥ 20 samples across ≥ 3 distinct ratings |
| `STRENGTH_CP_CAP` | 300 | Winsorisation cap on cpLoss before `ln(1+x)` scaling; blunders above 3 pawns all contribute `ln(4)=1.386`. Deliberate: distinguishing a 3-pawn blunder from a queen loss is not the goal |
| `STRENGTH_DECIDED_CP` | 600 | Exclude plies where \|cpWhite\| exceeds this; dead positions dominate ACPL and add noise |
| `STRENGTH_MIN_PLIES` | 12 | Minimum eligible plies to report a non-null estimate |
| `STRENGTH_ELO_MIN` | 600 | Lower clamp on the displayed estimate |
| `STRENGTH_ELO_MAX` | 2900 | Upper clamp on the displayed estimate |
| `STRENGTH_ROLLING_N` | 10 | Number of recent games in the inverse-variance rolling aggregate |
| `STRENGTH_COEFF_VERSION` | 1 | Must equal the version of the newest entry in `calibration/strength-model.json`; enforced by a test |
## Repertoire constants (`REP_*`) — added Phase 17

All constants below are in `src/shared/balance.js`. A `docs(balance):` commit is required to change
any of them.

| Parameter | Default | Range / Units | Notes |
|---|---|---|---|
| `REP_PLY_MAX` | 30 | plies | Book depth bound. Too low: book stops early. Too high: wasteful; reach probability is the real limiter |
| `REP_CONFIRM_OBS` | 2 | self-directed obs | Too low (1): misclicks enter the book. Too high (3+): genuine repeats fail to confirm |
| `REP_ADMIT_WIN_PTS` | 10 | win% pts lost | = INACCURACY_WIN_PTS; deviating breaks comparability |
| `REP_QUARANTINE_WIN_PTS` | 20 | win% pts lost | = MISTAKE_WIN_PTS; deviating breaks comparability |
| `REP_MIN_ABS_WIN_PCT` | 35 | win% | Too high: refuses everything in a bad position. Too low: allows near-losing positions |
| `REP_LINE_BUDGET_WIN_PTS` | 20 | cumulative win% pts | Too high: compound losses not caught. Too low: refuses all but sharpest prep |
| `REP_RECENCY_HALFLIFE_DAYS` | 120 | days | Too short: book forgets recent changes. Too long: never follows his development |
| `REP_ALT_ALTERNATION_MIN` | 3 | observations | Too high: spurious challenges. Too low: every two-game sequence opens a challenge |
| `REP_ALERTS_PER_GAME_MAX` | 3 | count | Too high: game interrupted too often. Too low: deviations go unrecorded |
| `REP_ALERT_TIMEOUT_SEC` | 60 | seconds | Too short: penalises slow players. Too long: game clock drains |
| `REP_COVERAGE_GOAL` | 50 | games (1-in-X) | Defines "worth covering"; tune to actual play frequency |
| `REP_AUDIT_DEPTH` | 22 | plies | Matches pass-2 depth; changing invalidates existing audits — rebuild required |
| `REP_AUDIT_MULTIPV` | 3 | count | Matches pass-2 multipv |
| `REP_BOOTSTRAP_CONFIRMED_MIN` | 20 | confirmed nodes | Too low: coach fires before book knows anything. Too high: coach never activates |
| `REP_CANDIDATE_TTL_ENCOUNTERS` | 8 | node encounters | Too low: rare nodes never confirm. Too high: misclicks linger |
| `REP_AUTO_PROMOTE` | true | bool | Flipped `true` in Phase 31 once depth-22 audit evidence was live. Emergency kill switch |
| `REP_CHALLENGE_REPEAT_CONFIRM` | 2 | challenger plays | Too low: misclick might promote. Too high: delays genuine preference |
| `REP_CHALLENGE_MIN_GAMES` | 6 | games | Too low: noise promotes early. Too high: delays trend/result signals |
| `REP_CHALLENGE_ENGINE_TOL` | 3 | win% pts cost | **Cost** challenger may impose (positive = challenger worse). Too high: blunders accepted. Too low: style moves rejected |
| `REP_CHALLENGE_ENGINE_CLEAR` | 2 | win% pts benefit | **Advantage** that auto-promotes (positive = challenger better). CLEAR < TOL is intentional |
| `REP_CHALLENGE_RESULT_MARGIN` | 0.10 | Elo-adj performance | Too low: noise promotes. Too high: style-call rule never activates |
| `REP_CHALLENGE_TREND_PLIES` | [2,4,6] | plies forward | Must be forward-only (not ±). Changing these changes which move_evals rows are joined |
| `REP_CHALLENGE_TTL_ENCOUNTERS` | 8 | node encounters | Too low: challenges close before evidence accumulates. Too high: node stays contested forever |
| `REP_REVERSAL_SUPPRESS_ENCOUNTERS` | 10 | node encounters | User control | Too low: reversal undone by next learning pass. Too high: suppresses legitimate re-promotion |

### Note on CLEAR vs TOL asymmetry

`REP_CHALLENGE_ENGINE_CLEAR` (2) < `REP_CHALLENGE_ENGINE_TOL` (3). They measure opposite directions:
- CLEAR = the engine *advantage* that auto-promotes the challenger with no results needed.
- TOL = the engine *cost* the challenger may impose and still be eligible for style-call promotion.

The asymmetry is intentional: two win% points of engine advantage is enough to adopt a move;
three win% points of engine disadvantage is still tolerated if the player keeps playing it and
the results support it. Getting the sign backwards silently inverts the feature.

The neutral band where neither rule fires immediately is `engine_delta ∈ [−3, +2)`.
## Changelog

<!-- Format: YYYY-MM-DD  parameter  old→new  observation (cite playtest_log.md entry) -->

2026-08-28  STRENGTH_ANCHOR_ELO / STRENGTH_ANCHOR_ASE / STRENGTH_ELO_PER_ASE
            Initial v1 calibration. Anchor ASE=0.2638 is the mean opponent ase of the two
            existing maia-1600 games (game 1213fa64: n=21 ase=0.218368, game 7117f3ae:
            n=26 ase=0.309279). Regan & Haworth 2011 slope (13034) was found too steep for
            single-PV cpLoss-based ase: Regan uses all-legal-moves ada while our ase uses
            only best-vs-played. Scale ratio our_ase/regan_ada = 0.2638/0.137 = 1.926,
            implying local slope ~6768. Using 6500 (within measurement uncertainty at two
            same-rating games) so both maia-1600 calibration games land within 295 Elo of
            1600. STRENGTH_ELO_PER_ASE will be refined once >=20 samples across >=3 distinct
            ratings are available (refit-strength.js).
            NOTE: anchor is tied to pass-1 search depth; a depth change warrants a refit.
            Sensitivity is mild: 8x engine-time buys 1.1 MAE pts (0.7%) -- see
            docs/research/strength-estimation.md §1.5.
