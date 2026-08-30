# Repertoire research dataset — data dictionary

Version 1. Exported from pawnbook Phase 25.

Each table is exported as NDJSON (one JSON object per line), ordered by the key columns shown.
Field names in the export use the SQL column names (snake_case).

---

## games

Primary key: `id`. Ordered by `id`.

| Column | Type | Notes | Used in |
|---|---|---|---|
| id | TEXT | UUID | all |
| opponent_id | TEXT | Maia model or engine ID (e.g. `maia-1500`) | RQ2, RQ3 |
| opponent_elo | INTEGER | Opponent Elo at game start | RQ1, RQ3 |
| player_color | TEXT | `white` or `black` | RQ1 |
| ranked | INTEGER | 1=ranked, 0=unranked; set to 0 when coach intervened | RQ2, RQ4 |
| coach_enabled | INTEGER | 1=coach active, 0=disabled for this game | RQ4 |
| status | TEXT | `in_progress`, `finished`, `abandoned` | filter |
| result | TEXT | `win`, `loss`, `draw` | RQ1, RQ3 |
| termination | TEXT | Reason game ended | — |
| elo_before | INTEGER | Player Elo before game (omitted when `--anonymise`) | RQ3 |
| elo_after | INTEGER | Player Elo after game (omitted when `--anonymise`) | RQ3 |
| accuracy | REAL | Player accuracy % from Stockfish analysis | RQ3 |
| played_at | INTEGER | Unix ms timestamp game finished | RQ2 timeline |
| analysis_state | TEXT | `pending`, `running`, `done`, `failed` | filter |

---

## game_moves

Primary key: `(game_id, ply)`. Ordered by `game_id, ply`.

| Column | Type | Notes | Used in |
|---|---|---|---|
| game_id | TEXT | FK → games.id | all |
| ply | INTEGER | 1-indexed half-move (1=White's first) | — |
| uci | TEXT | Move in UCI format (e.g. `e2e4`) | RQ4 |
| san | TEXT | Move in SAN format (e.g. `e4`) | PGN |
| ms_taken | INTEGER | Think time in ms (from clock) | RQ1 challenge evidence |

---

## move_evals

Primary key: `(game_id, ply)`. Ordered by `game_id, ply`.

| Column | Type | Notes | Used in |
|---|---|---|---|
| game_id | TEXT | FK → games.id | — |
| ply | INTEGER | — | — |
| fen | TEXT | Position before the move | — |
| move_uci | TEXT | Move played | — |
| win_before | REAL | Win% before move, mover's POV | RQ3 gate inputs |
| win_after | REAL | Win% after move, mover's POV | RQ3 trend |
| win_loss_pts | REAL | `win_before - win_after` (loss = positive) | RQ3 soundness gate |
| best_move_uci | TEXT | Engine's top move | — |
| classification | TEXT | `blunder`, `mistake`, `inaccuracy`, etc. | — |
| maia_policy | REAL | Maia probability of the played move | RQ5 calibration |

---

## rep_observations

Primary key: `(game_id, ply)`. Ordered by `game_id, ply`.
**Append-only — never mutated or deleted.**

| Column | Type | Notes | Used in |
|---|---|---|---|
| game_id | TEXT | FK → games.id | — |
| ply | INTEGER | — | — |
| epd | TEXT | EPD (first four FEN fields) of the position | all |
| side | TEXT | `white` or `black` (who played) | — |
| move_uci | TEXT | Move played | RQ2, RQ4 |
| win_loss_pts | REAL | Win% points lost by this move | RQ3 gate evidence |
| source | TEXT | `game`, `coach_kept`, `coach_corrected` | RQ2 — only `game`+`coach_kept` count toward confirmation |
| book_version | INTEGER | Book state when observation was recorded | RQ2 reproducibility |
| provenance_id | INTEGER | FK → rep_provenance.id | reproducibility |

---

## rep_deviations

Primary key: `id`. Ordered by `game_id, ply`.
**Append-only.**

| Column | Type | Notes | Used in |
|---|---|---|---|
| id | TEXT | UUID | — |
| game_id | TEXT | FK → games.id | — |
| ply | INTEGER | — | — |
| epd | TEXT | Position where deviation occurred | RQ4 |
| kind | TEXT | `refused_repeat`, `lapse`, `novelty`, `order_slip`, etc. | RQ4 |
| played_uci | TEXT | What the player actually played | RQ1 |
| book_uci | TEXT | What the book wanted | RQ1 |
| resolution | TEXT | `alerted_corrected`, `alerted_kept`, `alerted_timeout`, `post_game` | RQ4 |
| decision_ms_taken | INTEGER | Time from alert to choice, ms | RQ4 hesitation |

---

## rep_challenges

Primary key: `id`. Ordered by `id`.
**Append-only — never deleted.**

| Column | Type | Notes | Used in |
|---|---|---|---|
| id | TEXT | UUID | RQ1 |
| epd | TEXT | Position of the contest | RQ1 |
| incumbent_uci | TEXT | Current canonical move | RQ1 |
| challenger_uci | TEXT | Move the player refused back to | RQ1 |
| opened_at | INTEGER | Unix ms when challenge opened | RQ1 timeline |
| challenger_plays | INTEGER | Unprompted plays of challenger after opening | RQ1 rule 3 |
| incumbent_plays | INTEGER | Plays of incumbent after opening | RQ1 rule 6 |
| engine_delta_win_pts | REAL | `winPct(challenger) − winPct(incumbent)`; positive = challenger better | RQ1, RQ3 |
| result_challenger_perf | REAL | Elo-adjusted performance score, challenger games | RQ1, RQ3 |
| result_challenger_n | INTEGER | Number of games contributing to challenger performance | RQ1 |
| result_incumbent_n | INTEGER | Number of games contributing to incumbent performance | RQ1 |
| status | TEXT | `open`, `promoted`, `rejected`, `rejected_unsound`, `abandoned`, `settled_both` | RQ1 |
| resolution_rule | TEXT | Which numbered rule in §9 fired | RQ1 |
| move_ms_taken | INTEGER | Player think-time on the challenging move | RQ1 (misclick proxy) |
| decision_ms_taken | INTEGER | Time from alert to 'keep' choice | RQ1 |

---

## rep_changelog

Primary key: `id`. Ordered by `at, id`.
**Append-only.**

| Column | Type | Notes | Used in |
|---|---|---|---|
| id | TEXT | UUID | — |
| at | INTEGER | Unix ms of the change | RQ2 timeline |
| epd | TEXT | Position that changed | RQ2 |
| side | TEXT | `white` or `black` | — |
| kind | TEXT | `promote`, `retire`, `confirm`, `settle`, `reverse` | RQ2 |
| from_uci | TEXT | Outgoing move (if applicable) | RQ1, RQ2 |
| to_uci | TEXT | Incoming move (if applicable) | RQ1 |
| rule | TEXT | Rule number that fired (for `promote`) | RQ1 |
| detail_json | TEXT | JSON with supporting statistics | RQ1 |
| book_version | INTEGER | Version after this change | reproducibility |

---

## rep_nodes

Primary key: `(epd, side)`. Ordered by `epd, side`.
**Rebuildable projection.**

| Column | Type | Notes | Used in |
|---|---|---|---|
| epd | TEXT | Position key | all |
| side | TEXT | `white` or `black` | — |
| fen | TEXT | Representative full FEN | PGN context |
| encounters | INTEGER | Times any move was played here | RQ2 TTL |
| times_reached | INTEGER | Total times the node was reached in games | RQ5 denominator |
| reach_prob | REAL | Maia-policy reach probability, cached | RQ5 |
| line_loss | REAL | Min cumulative win% loss over book paths to this node | RQ3 gate 3 |

---

## rep_moves

Primary key: `(epd, side, move_uci)`. Ordered by `epd, side, move_uci`.
**Rebuildable projection.**

| Column | Type | Notes | Used in |
|---|---|---|---|
| epd | TEXT | Position key | — |
| side | TEXT | — | — |
| move_uci | TEXT | — | — |
| move_san | TEXT | — | — |
| role | TEXT | `candidate`, `canonical`, `alt`, `challenger`, `quarantined`, `refused`, `retired` | RQ2 |
| observations | INTEGER | Self-directed plays (excludes `coach_corrected`) | RQ2 |
| mean_win_loss_pts | REAL | Mean win% loss over observed games | RQ3 |
| score_w / score_d / score_l | INTEGER | W/D/L results when this move was played | RQ1, RQ3 |
| first_played | INTEGER | Unix ms of first observation | RQ2 growth curve |
| last_played | INTEGER | Unix ms of most recent observation | — |

---

## rep_provenance

Primary key: `id`. Ordered by `id`.

| Column | Type | Notes | Used in |
|---|---|---|---|
| id | INTEGER | Auto-increment | reproducibility |
| at | INTEGER | Unix ms when context was first seen | — |
| schema_version | TEXT | Phase number that produced this data | reproducibility |
| balance_hash | TEXT | SHA-256 of `src/shared/balance.js` at export time | reproducibility |
| app_git_sha | TEXT | Git SHA of the app at export time (nullable) | reproducibility |
| sf_version | TEXT | Stockfish version used (nullable) | RQ3 |
| sf_depth | INTEGER | Analysis depth | RQ3 |
| sf_multipv | INTEGER | MultiPV setting | RQ3 |
| maia_weights_id | TEXT | Maia weights used for policy (nullable) | RQ5 |

---

## Notes on reproducibility (invariant 13)

- All NDJSON files are ordered by explicit SQL `ORDER BY` clauses — no map-iteration order.
- Timestamps in exported files come from DB columns; the only wall-clock value is `sidecar.json`'s `exportedAt`, which is excluded from `manifest.sha256`.
- Two exports of the same database at the same `book_version` produce byte-identical NDJSON and PGN files.
- `manifest.sha256` lists SHA-256 hashes of all files except `sidecar.json` and itself; re-run `sha256sum -c manifest.sha256` from the export directory to verify integrity.
- `rep_nodes` and `rep_moves` are rebuildable projections — their contents may differ across book versions even if observations are unchanged.
