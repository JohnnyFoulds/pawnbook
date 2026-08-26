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
| `ELO_DIFF_CLAMP` | 400 | 300–800 | Unclamped, sf-max becomes a free-roll |
| `K_PROVISIONAL` | 40 | standard | Rating too jumpy in first 15 games |
| `K_MID` | 20 | standard | Rating too sticky |
| `K_HIGH` | 10 | standard | Rating too sticky at top |
| `DRILL_BATCH` | 10 | 5–20 | Sessions that never end, or end before warming up |
| `DUE_SOFT_CAP` | 40 | 20–100 | Queue feels like debt |
| `TARGET_RETENTION` | 0.90 | 0.80–0.95 | High: same puzzles constantly. Low: things fall out of memory |
| `GRADUATE_REPS` | 5 | 3–8 | Cards never retire |
| `GRADUATE_INTERVAL_D` | 180 | 90–365 | Cards retire while still shaky |
| `ENDGAME_MATERIAL_MAX` | 13 | — | Phase classification wrong |
| `OPENING_PLY_MAX` | 20 | — | Phase classification wrong |

## Changelog

<!-- Format: YYYY-MM-DD  parameter  old→new  observation (cite playtest_log.md entry) -->
