# Data model — auto-repertoire

**Status:** Phase 17 — 2026-08-29  
All DDL is idempotent, following the in-try `ALTER TABLE` pattern established at `schema.js:15-17`.
Column names with `**` are the authoritative form (previously misnamed in discussion).

---

## Existing table changes

### `games`

```sql
ALTER TABLE games ADD COLUMN coach_enabled INTEGER NOT NULL DEFAULT 1;
```

Added with the in-try pattern. `1 = coach active`. Readable at game creation and by
`src/api/ws/analysis-service.js` for the strength-sample guard (FR-REP-COACH-14).

### `puzzles` — UNIQUE constraint migration

Current constraint: `UNIQUE(fen)` — confirmed at `schema.js:132`.  
Required: `UNIQUE(fen, kind)` — allows the same FEN to be both a tactics and an opening card.

Migration procedure (table-rebuild pattern, same as `move_evals` NOT-NULL migration):

```sql
-- 1. Create new table with corrected constraint
CREATE TABLE puzzles_new (
  id              INTEGER PRIMARY KEY,
  fen             TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'tactical',
  best_move_uci   TEXT NOT NULL,
  accepted_moves_json TEXT,
  temptation      REAL,
  instructiveness REAL,
  times_seen      INTEGER NOT NULL DEFAULT 1,
  UNIQUE(fen, kind)
);

-- 2. Copy rows (existing rows get kind='tactical')
INSERT INTO puzzles_new
SELECT id, fen, 'tactical', best_move_uci, accepted_moves_json,
       temptation, instructiveness, times_seen
FROM puzzles;

-- 3. Drop old, rename
DROP TABLE puzzles;
ALTER TABLE puzzles_new RENAME TO puzzles;
```

Rollback: reverse steps 3 → 1 (restore backup taken before migration). A test verifies no rows are
lost and `UNIQUE(fen, kind)` is in force after the migration.

---

## New tables

Every append-only table below also carries:
- `provenance_id INTEGER NOT NULL REFERENCES rep_provenance(id)` — measurement context
- `book_version INTEGER NOT NULL` — book state at time of recording

These are listed once here. They are omitted from individual column lists for brevity but are
present in the DDL.

### `rep_provenance` — measurement context

```sql
CREATE TABLE IF NOT EXISTS rep_provenance (
  id              INTEGER PRIMARY KEY,
  at              INTEGER NOT NULL,        -- Unix epoch ms
  schema_version  TEXT NOT NULL,
  balance_hash    TEXT NOT NULL,           -- SHA-256 of src/shared/balance.js
  app_git_sha     TEXT,
  sf_version      TEXT,                    -- Stockfish version string
  sf_depth        INTEGER,
  sf_multipv      INTEGER,
  maia_weights_id TEXT
);
```

One row per distinct measurement context; reused across rows within the same context. `book_version`
is NOT a column here — it changes per book change, orders of magnitude more often than this context.
Mixing them would force a new provenance row per change and destroy the reuse.

### `rep_book_version` — monotonic counter

```sql
CREATE TABLE IF NOT EXISTS rep_book_version (
  singleton INTEGER PRIMARY KEY DEFAULT 0 CHECK(singleton = 0),  -- single row
  version   INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO rep_book_version (singleton, version) VALUES (0, 0);
```

Incremented in the same transaction as every book change (invariant 12).

### `rep_observations` — append-only: one row per own opening ply (DATASET)

```sql
CREATE TABLE IF NOT EXISTS rep_observations (
  id           INTEGER PRIMARY KEY,
  game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply          INTEGER NOT NULL,
  epd          TEXT NOT NULL,
  side         TEXT NOT NULL CHECK(side IN ('white','black')),
  move_uci     TEXT NOT NULL,
  move_san     TEXT NOT NULL,
  win_loss_pts REAL,                       -- NULL until move_evals row exists
  classification TEXT,
  played_at    INTEGER NOT NULL,           -- Unix epoch ms
  source       TEXT NOT NULL CHECK(source IN ('game','coach_kept','coach_corrected')),
  provenance_id INTEGER NOT NULL REFERENCES rep_provenance(id),
  book_version  INTEGER NOT NULL,
  UNIQUE(game_id, ply)
);
CREATE INDEX IF NOT EXISTS rep_obs_epd ON rep_observations(epd, side);
```

`source = 'coach_corrected'` MUST be recorded but MUST NOT count toward confirmation or the vote
(FR-REP-LEARN-2, invariant 10).

### `rep_deviations` — append-only: per-game deviation log

```sql
CREATE TABLE IF NOT EXISTS rep_deviations (
  id               INTEGER PRIMARY KEY,
  game_id          INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply              INTEGER NOT NULL,
  epd              TEXT NOT NULL,
  kind             TEXT NOT NULL,          -- deviation classification (§FR-REP-BOOK)
  played_uci       TEXT NOT NULL,
  book_uci         TEXT,                   -- NULL if no canonical move at node
  resolution       TEXT CHECK(resolution IN (
                     'alerted_corrected','alerted_kept','alerted_timeout','post_game')),
  decision_ms_taken INTEGER,              -- NULL for timeout/post_game
  provenance_id    INTEGER NOT NULL REFERENCES rep_provenance(id),
  book_version     INTEGER NOT NULL
);
```

The four-value enum is exact and complete. Earlier drafts had `alerted_kept_learn` and
`alerted_kept_once` — these were removed because they stored a user classification, violating
invariant 10.

### `rep_challenges` — append-only: refusal record (DATASET — never deleted)

```sql
CREATE TABLE IF NOT EXISTS rep_challenges (
  id                    INTEGER PRIMARY KEY,
  epd                   TEXT NOT NULL,
  side                  TEXT NOT NULL CHECK(side IN ('white','black')),
  fen                   TEXT NOT NULL,           -- representative FEN at node
  incumbent_uci         TEXT NOT NULL,
  challenger_uci        TEXT NOT NULL,
  opened_game_id        INTEGER NOT NULL REFERENCES games(id),
  opened_ply            INTEGER NOT NULL,
  opened_at             INTEGER NOT NULL,        -- Unix epoch ms

  -- Incumbent snapshot at open time
  inc_observations      INTEGER NOT NULL,
  inc_mean_win_loss_pts REAL,
  inc_score_w           INTEGER NOT NULL DEFAULT 0,
  inc_score_d           INTEGER NOT NULL DEFAULT 0,
  inc_score_l           INTEGER NOT NULL DEFAULT 0,
  inc_card_state        TEXT,                    -- FSRS card state JSON, nullable

  -- Accumulated evidence
  challenger_plays      INTEGER NOT NULL DEFAULT 0,
  incumbent_plays       INTEGER NOT NULL DEFAULT 0,
  encounters_since_open INTEGER NOT NULL DEFAULT 0,
  move_ms_taken         INTEGER,                 -- think-time before played_uci
  move_ms_zscore        REAL,                    -- z-score vs player's distribution at this ply
  decision_ms_taken     INTEGER,                 -- time to answer the alert

  -- Three signals (filled by Phase 22)
  engine_delta_win_pts  REAL,                    -- winPct(challenger) - winPct(incumbent)
  engine_audit_id       INTEGER REFERENCES rep_audits(id),
  trend_challenger      REAL,                    -- mean win% at +TREND_PLIES, challenger games
  trend_incumbent       REAL,
  result_challenger_perf REAL,                   -- Elo-adjusted performance, challenger games
  result_challenger_n   INTEGER NOT NULL DEFAULT 0,
  result_incumbent_perf REAL,
  result_incumbent_n    INTEGER NOT NULL DEFAULT 0,

  -- Resolution
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK(status IN ('open','promoted','rejected','rejected_unsound',
                                    'abandoned','settled_both')),
  resolution_rule TEXT,                          -- numbered rule from §FR-REP-CHAL-4
  resolved_at    INTEGER,                        -- Unix epoch ms
  resolved_by    TEXT CHECK(resolved_by IN ('algorithm','user_override')),
  gate_reason    TEXT,                           -- why gate veto fired, if applicable

  provenance_id  INTEGER NOT NULL REFERENCES rep_provenance(id),
  book_version   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rep_chal_epd ON rep_challenges(epd, side, status);
```

### `rep_audits` — append-only: engine audit records

```sql
CREATE TABLE IF NOT EXISTS rep_audits (
  id           INTEGER PRIMARY KEY,
  epd          TEXT NOT NULL,
  side         TEXT NOT NULL CHECK(side IN ('white','black')),
  move_uci     TEXT NOT NULL,
  depth        INTEGER NOT NULL,
  multipv      INTEGER NOT NULL,
  win_pct      REAL NOT NULL,        -- mover's win% after move_uci
  cp           REAL,                 -- centipawn eval (may be NULL for forced mate)
  pv           TEXT,                 -- principal variation (space-separated UCI)
  run_at       INTEGER NOT NULL,     -- Unix epoch ms
  provenance_id INTEGER NOT NULL REFERENCES rep_provenance(id),
  book_version  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rep_audit_epd ON rep_audits(epd, side, move_uci, depth);
```

This table is **why invariant 4 is true**: an audit is an engine measurement that cannot be
recomputed from `rep_observations` alone. Without it, `rep_moves.audit_id` points at nothing a
rebuild can reconstruct, and the audit provenance is lost.

Gate evaluations and challenges reference audits by `id`, not by copying win% values around.
A rebuild that detects a `REP_AUDIT_DEPTH` change MUST refuse to proceed rather than silently
mixing audit rows from different depths (N-3).

### `rep_changelog` — append-only: book change feed

```sql
CREATE TABLE IF NOT EXISTS rep_changelog (
  id           INTEGER PRIMARY KEY,
  at           INTEGER NOT NULL,    -- Unix epoch ms
  epd          TEXT NOT NULL,
  side         TEXT NOT NULL CHECK(side IN ('white','black')),
  kind         TEXT NOT NULL CHECK(kind IN ('promote','retire','confirm','refuse','settle','reverse',
                      'elect','quarantine_exit')),
  from_uci     TEXT,
  to_uci       TEXT,
  challenge_id INTEGER REFERENCES rep_challenges(id),
  rule         TEXT,                -- numbered rule that fired
  detail_json  TEXT,               -- signal values, sample sizes, etc.
  provenance_id INTEGER NOT NULL REFERENCES rep_provenance(id),
  book_version  INTEGER NOT NULL
);
```

Drives the notification feed and the one-click reversal (FR-REP-CHAL-8).

### `rep_suppressions` — reversal memory

```sql
CREATE TABLE IF NOT EXISTS rep_suppressions (
  epd              TEXT NOT NULL,
  side             TEXT NOT NULL CHECK(side IN ('white','black')),
  move_uci         TEXT NOT NULL,
  until_encounters INTEGER NOT NULL,   -- absolute encounter count at which suppression expires
  created_at       INTEGER NOT NULL,   -- Unix epoch ms
  changelog_id     INTEGER NOT NULL REFERENCES rep_changelog(id),
  PRIMARY KEY (epd, side, move_uci)
);
```

A suppression blocks re-promotion for `REP_REVERSAL_SUPPRESS_ENCOUNTERS` encounters. Without this
table the next learning pass re-fires on identical evidence and silently undoes the reversal.
Keyed by `(epd, side, move_uci)` because only one suppression per move can be active.

---

## Derived projections (disposable, rebuildable)

### `rep_nodes`

```sql
CREATE TABLE IF NOT EXISTS rep_nodes (
  epd                        TEXT NOT NULL,
  side                       TEXT NOT NULL CHECK(side IN ('white','black')),
  fen                        TEXT NOT NULL,       -- representative FEN
  first_seen                 INTEGER NOT NULL,
  last_seen                  INTEGER NOT NULL,
  times_reached              INTEGER NOT NULL DEFAULT 0,
  encounters                 INTEGER NOT NULL DEFAULT 0,  -- TTL denominator
  min_ply                    INTEGER NOT NULL,
  reach_prob                 REAL,
  reach_stale                INTEGER NOT NULL DEFAULT 1,  -- 1 = needs recompute
  line_loss                  REAL,                -- minimum cumulative win_loss_pts over book paths
  vote_frozen_until_encounter INTEGER,            -- suppression after reversal
  PRIMARY KEY (epd, side)
);
```

`line_loss` is the **minimum** over observed book paths from root to this node (§FR-REP-GATE-3).
Minimum because: a node reached via a sloppy path should not be permanently poisoned; max would
make transpositions harmful. Recomputed whenever any upstream edge or move-loss changes.

`encounters` is the counter used by candidate TTL (`REP_CANDIDATE_TTL_ENCOUNTERS`) and challenge
TTL (`REP_CHALLENGE_TTL_ENCOUNTERS`) — counted at the node, not globally.

### `rep_moves`

```sql
CREATE TABLE IF NOT EXISTS rep_moves (
  epd              TEXT NOT NULL,
  side             TEXT NOT NULL CHECK(side IN ('white','black')),
  move_uci         TEXT NOT NULL,
  move_san         TEXT NOT NULL,
  role             TEXT NOT NULL CHECK(role IN (
                     'candidate','canonical','alt','challenger',
                     'quarantined','refused','retired')),
  observations     INTEGER NOT NULL DEFAULT 0,    -- self-directed only
  weighted_score   REAL,                          -- recency-weighted vote score
  mean_win_loss_pts REAL,
  worst_win_loss_pts REAL,
  audit_id         INTEGER REFERENCES rep_audits(id),
  gate_reason      TEXT,
  score_w          INTEGER NOT NULL DEFAULT 0,
  score_d          INTEGER NOT NULL DEFAULT 0,
  score_l          INTEGER NOT NULL DEFAULT 0,
  first_played     INTEGER,
  last_played      INTEGER,
  PRIMARY KEY (epd, side, move_uci)
);
```

### `rep_policy` — Maia policy cache

```sql
CREATE TABLE IF NOT EXISTS rep_policy (
  epd             TEXT    NOT NULL,
  maia_model      TEXT    NOT NULL,
  maia_weights_id TEXT    NOT NULL,
  policy_json     TEXT    NOT NULL,    -- {move_uci: probability} for all legal moves
  computed_at     INTEGER NOT NULL,
  PRIMARY KEY (epd, maia_model, maia_weights_id)
);
```

`maia_model` and `maia_weights_id` in the key: a model type change or weights upgrade invalidates
the cache rather than silently mixing two models' probabilities into one calibration curve
(RQ5 would be quietly wrong otherwise).

---

## Invariants (mapped to spec Q-component)

See `feature_spec.md` §Q for the normative list. Data model notes on each:

- **Inv 4** (reproducibility): the full input set is `rep_observations + rep_challenges + rep_audits
  + rep_suppressions + move_evals + balance constants`. "From `rep_observations` alone" understated it.
- **Inv 8** (audit before canonical): `rep_moves.audit_id IS NOT NULL` for every `role = 'canonical'`
  row is a SQL-level check; the test confirms the audit's depth matches `REP_AUDIT_DEPTH`.
- **Inv 13** (export determinism): `rep_policy.computed_at` is excluded from the export manifest
  hash; every table export is `ORDER BY` an explicit key, not insertion order.
- **Inv 14** (no single-observation canonical): enforced by the promotion precondition in
  `src/domain/repertoire/challenge.js`; `rep_moves.observations >= REP_CONFIRM_OBS` is a runtime
  check before any canonical write.
- **Inv 15** (no challenge on timeout/post_game): enforced by the `IF resolution = 'alerted_kept'`
  guard in `handleMove`.
