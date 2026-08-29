# Data dictionary — auto-repertoire dataset

**Date:** 2026-08-29 (preliminary; finalised at Phase 25)  
Shipped with every `scripts/export-research-dataset.js` run. Every exported field is listed here;
every field listed here is exported. Phase 25 DoD requires these sets to match.

---

## Export structure

```
export/
├── manifest.json         SHA-256 of every data file; export metadata (book_version, schema_version)
├── games.jsonl           One game per line
├── game_moves.jsonl      All moves (both sides)
├── move_evals.jsonl      Engine evaluations
├── rep_observations.jsonl  Append-only repertoire observations
├── rep_deviations.jsonl    Per-game deviation log
├── rep_challenges.jsonl    Refusal record (the labelled dataset)
├── rep_audits.jsonl        Engine audit measurements
├── rep_changelog.jsonl     Book change feed
├── rep_suppressions.jsonl  Reversal memory
├── rep_provenance.jsonl    Measurement context records
├── rep_book_version.jsonl  Version counter history
├── data_dictionary.md    This file
└── games.pgn             All games in PGN format
```

`--anonymise` removes `games.white_name` / `games.black_name` and any free-text fields.

---

## `games`

| Field | Type | Units | Notes |
|---|---|---|---|
| `id` | integer | — | PK |
| `opponent_id` | integer | — | References roster |
| `opponent_name` | string | — | Denormalised for convenience |
| `opponent_elo` | integer\|null | Elo points | Null for Drawfish |
| `player_color` | `'white'\|'black'` | — | |
| `ranked` | 0\|1 | — | 0 if flipped by coach |
| `coach_enabled` | 0\|1 | — | 1 = coach was active |
| `result` | `'1-0'\|'0-1'\|'1/2-1/2'\|'*'` | — | |
| `elo_before` | integer | Elo points | Player Elo at game start |
| `elo_after` | integer\|null | Elo points | Null if unranked |
| `accuracy` | real\|null | % (0–100) | Player move accuracy |
| `strength_elo` | integer\|null | Elo points | Estimated strength this game |
| `opponent_strength_elo` | integer\|null | Elo points | Estimated opponent strength |
| `analysis_state` | string | — | `'done'` for exported games |
| `created_at` | integer | Unix epoch ms | Game start time |
| `ended_at` | integer\|null | Unix epoch ms | |

**Used by RQs:** RQ1 (result), RQ2 (game count), RQ3 (result + elo_before), RQ4 (coach_enabled)

---

## `rep_observations`

| Field | Type | Units | Notes |
|---|---|---|---|
| `id` | integer | — | PK |
| `game_id` | integer | — | FK games |
| `ply` | integer | half-moves | 1-indexed |
| `epd` | string | — | First four FEN fields; the position key |
| `side` | `'white'\|'black'` | — | Moving side |
| `move_uci` | string | — | e.g. `'e2e4'` |
| `move_san` | string | — | Algebraic notation |
| `win_loss_pts` | real\|null | win% points | Mover's perspective; null until eval exists |
| `classification` | string\|null | — | `'best'\|'great'\|'good'\|'ok'\|'inaccuracy'\|...` |
| `played_at` | integer | Unix epoch ms | |
| `source` | string | — | `'game'\|'coach_kept'\|'coach_corrected'` |
| `provenance_id` | integer | — | FK rep_provenance |
| `book_version` | integer | — | Book state at recording time |

**Used by RQs:** All (primary source of the book's formation history)  
**Note:** Only `source ∈ ('game','coach_kept')` rows count toward promotion and the vote.
`coach_corrected` rows are in the dataset for audit purposes.

---

## `rep_deviations`

| Field | Type | Units | Notes |
|---|---|---|---|
| `id` | integer | — | PK |
| `game_id` | integer | — | FK games |
| `ply` | integer | half-moves | |
| `epd` | string | — | Position key |
| `kind` | string | — | Deviation classification (e.g. `'order_slip'`, `'novelty'`) |
| `played_uci` | string | — | Move the player tried |
| `book_uci` | string\|null | — | Canonical book move offered; null if node had no canonical |
| `resolution` | string | — | `'alerted_corrected'\|'alerted_kept'\|'alerted_timeout'\|'post_game'` |
| `decision_ms_taken` | integer\|null | milliseconds | Null for timeout/post_game |
| `provenance_id` | integer | — | FK rep_provenance |
| `book_version` | integer | — | |

**Used by RQs:** RQ2 (interaction cost per game), RQ4 (deviation rate per node)

---

## `rep_challenges` — the labelled dataset

| Field | Type | Units | Notes |
|---|---|---|---|
| `id` | integer | — | PK |
| `epd` | string | — | Position key |
| `side` | string | — | Moving side |
| `fen` | string | — | Representative FEN |
| `incumbent_uci` | string | — | Book move at time of challenge |
| `challenger_uci` | string | — | Refused move |
| `opened_game_id` | integer | — | FK games |
| `opened_ply` | integer | half-moves | |
| `opened_at` | integer | Unix epoch ms | |
| `inc_observations` | integer | count | Self-directed observations at open time |
| `inc_mean_win_loss_pts` | real\|null | win% points | Incumbent's mean loss |
| `inc_score_w/d/l` | integer | count | Incumbent results snapshot |
| `inc_card_state` | string\|null | JSON | FSRS card state at open time |
| `challenger_plays` | integer | count | Opening refusal + unprompted repeats |
| `incumbent_plays` | integer | count | Unprompted plays after challenge opened |
| `encounters_since_open` | integer | count | Node encounters since open |
| `move_ms_taken` | integer\|null | milliseconds | Think-time before played_uci |
| `move_ms_zscore` | real\|null | — | z-score vs player's distribution at this ply |
| `decision_ms_taken` | integer\|null | milliseconds | Time to answer the alert |
| `engine_delta_win_pts` | real\|null | win% points | `winPct(challenger) − winPct(incumbent)`; positive = challenger better |
| `engine_audit_id` | integer\|null | — | FK rep_audits; the A/B audit |
| `trend_challenger` | real\|null | win% | Mean win% at +TREND_PLIES, challenger games |
| `trend_incumbent` | real\|null | win% | Same for incumbent games |
| `result_challenger_perf` | real\|null | — | Elo-adjusted performance, challenger games |
| `result_challenger_n` | integer | count | Games in challenger result sample |
| `result_incumbent_perf` | real\|null | — | |
| `result_incumbent_n` | integer | count | |
| `status` | string | — | `'open'\|'promoted'\|'rejected'\|'rejected_unsound'\|'abandoned'\|'settled_both'` |
| `resolution_rule` | string\|null | — | Numbered rule from §FR-REP-CHAL-4 |
| `resolved_at` | integer\|null | Unix epoch ms | |
| `resolved_by` | string\|null | — | `'algorithm'\|'user_override'` |
| `gate_reason` | string\|null | — | Why gate veto fired |
| `provenance_id` | integer | — | FK rep_provenance |
| `book_version` | integer | — | |

**Used by RQs:** RQ1 (primary — every row is one refusal event), RQ3 (style-call promotions)

**Note on `engine_delta_win_pts` sign convention:** positive = challenger is better than incumbent.
This is the key quantity for RQ1. A distribution skewed positive means refusals tend to be
improvements. Zero median means neutral. Negative median means the player tends to refuse book moves
that were actually better.

---

## `rep_audits`

| Field | Type | Units | Notes |
|---|---|---|---|
| `id` | integer | — | PK |
| `epd` | string | — | |
| `side` | string | — | |
| `move_uci` | string | — | |
| `depth` | integer | plies | Stockfish depth |
| `multipv` | integer | count | MultiPV setting |
| `win_pct` | real | % (0–100) | Mover's win% after move_uci |
| `cp` | real\|null | centipawns | Null for forced-mate positions |
| `pv` | string\|null | — | Space-separated UCI moves |
| `run_at` | integer | Unix epoch ms | |
| `provenance_id` | integer | — | FK rep_provenance |
| `book_version` | integer | — | |

**Used by RQs:** RQ1 (engine_delta via this table), RQ3 (engine side of style-call evidence)

---

## `rep_provenance`

| Field | Type | Notes |
|---|---|---|
| `id` | integer | PK |
| `at` | integer | Unix epoch ms |
| `schema_version` | integer | DB schema version |
| `balance_hash` | string | SHA-256 of `src/shared/balance.js` |
| `app_git_sha` | string | Git commit at time of measurement |
| `sf_version` | string | Stockfish version string |
| `sf_depth` | integer | Default analysis depth |
| `sf_multipv` | integer | Default MultiPV |
| `maia_weights_id` | string | Maia weights identifier |

Used to condition analyses on the measurement context. Any analysis that compares values produced
under different `balance_hash` or `sf_version` values must account for the instrument change.

---

## Elo-adjusted performance formula

Used in `rep_challenges.result_challenger_perf` and `result_incumbent_perf`:

```
performance = score − 1 / (1 + 10^((opponent_elo − elo_before) / 400))
```

where `score ∈ {1, 0.5, 0}`, `opponent_elo` and `elo_before` are from `games`. Averaged over all
games in the sample. A positive value means the player outperformed their expected score against
that opponent at that Elo.

---

## Engine delta sign convention

```
engine_delta_win_pts = winPct(challenger) − winPct(incumbent)
```

Positive = challenger is the better move by engine evaluation. This is the sign the challenge
resolution rules use. Getting this wrong inverts the feature: an engine-clear threshold of +2 would
accept only challengers that are *worse* than the incumbent.
