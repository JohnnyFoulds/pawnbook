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

## Changelog

<!-- Format: YYYY-MM-DD  parameter  old→new  observation (cite playtest_log.md entry) -->
