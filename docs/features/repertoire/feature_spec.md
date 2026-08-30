# Feature spec — auto-repertoire

**Status:** Phase 17 draft — 2026-08-29  
**Authority:** This document is normative. Where it contradicts `design_plan.md` or any research
document, the spec wins. RFC 2119 throughout: MUST, SHOULD, MAY, MUST NOT, SHOULD NOT.

---

## R — Functional requirements

### FR-REP-BOOK: Position keying and book structure

- FR-REP-BOOK-1: Every book node MUST be keyed by **EPD** (the first four fields of FEN — position,
  active colour, castling rights, en-passant target square). Move order and fullmove/halfmove counters
  MUST NOT be part of the key. This makes transpositions free: reaching a known position by a
  different move order is not a deviation.
- FR-REP-BOOK-2: Each node MUST store one representative full FEN so that `chess.js` can reconstruct
  the board position.
- FR-REP-BOOK-3: Each move at a node MUST carry exactly one role from the set
  `{candidate, canonical, alt, challenger, quarantined, refused, retired}`. A move MUST NOT hold
  more than one role simultaneously.
- FR-REP-BOOK-4: At most one move per `(epd, side)` MUST hold the role `canonical`.
- FR-REP-BOOK-5: The **accepted set** at a node is exactly `{canonical, alt, challenger, quarantined}`.
  A move in the accepted set MUST NOT trigger an alert if played.
- FR-REP-BOOK-6: The **alerting set** is exactly `{refused, retired}`. Playing a move in the alerting
  set MUST trigger an alert (subject to §FR-REP-COACH guards).
- FR-REP-BOOK-7: The `candidate` role is invisible to the coach: playing a `candidate` MUST be treated
  as `new_territory` (silent; observation recorded).
- FR-REP-BOOK-8: The book MUST be stored as a DAG keyed by EPD, not as a tree of move sequences. The
  same node MUST be reachable from multiple parents without duplication.

### FR-REP-LEARN: Observation → candidate → confirmed

- FR-REP-LEARN-1: Every own ply within `REP_PLY_MAX` of the initial position in an analysed game MUST
  produce a `rep_observations` row.
- FR-REP-LEARN-2: An observation with `source = 'coach_corrected'` MUST be recorded in
  `rep_observations` but MUST NOT count toward `observations` for promotion purposes and MUST NOT
  contribute to the recency-weighted vote. Only `source ∈ ('game', 'coach_kept')` counts.
- FR-REP-LEARN-3: A move seen for the first time at a node MUST be assigned role `candidate`
  (`observations = 1`). A single observation MUST NOT result in any other role.
- FR-REP-LEARN-4: A `candidate` MUST transition to `canonical`, `alt`, or `quarantined` when
  `observations ≥ REP_CONFIRM_OBS` (2, counting only self-directed observations) **and** the four
  soundness gates (§FR-REP-GATE) pass. If the gates refuse it, it transitions to `refused`.
- FR-REP-LEARN-5: The **canonical move** at a node MUST be selected by a recency-weighted vote:
  weight `= exp(−ln(2) · ageDays / REP_RECENCY_HALFLIFE_DAYS)` per self-directed observation.
  Tie-break order: lower mean `win_loss_pts`, then higher results score (W/D/L).
- FR-REP-LEARN-6: When two moves at a node both hold ≥ `REP_ALT_ALTERNATION_MIN` (3) self-directed
  observations within one recency half-life, they MUST settle as `canonical` + `alt` with no
  challenge opened between them.
- FR-REP-LEARN-7: A `canonical` move MUST drop to `retired` when a rival move overtakes it on the
  weighted vote and passes all four gates.
- FR-REP-LEARN-8: A `quarantined` move MUST be re-audited on each subsequent encounter at the node.
  A clean audit (`win_loss_pts < REP_ADMIT_WIN_PTS`) MUST move it to `alt`; a failing audit
  (`win_loss_pts ≥ REP_QUARANTINE_WIN_PTS`) MUST move it to `refused`. It MUST NOT become `canonical`.
- FR-REP-LEARN-9: A `candidate` that receives no further self-directed observation within
  `REP_CANDIDATE_TTL_ENCOUNTERS` encounters **at that node** MUST expire silently with no log entry.
  The TTL MUST be measured in node encounters, not games played.
- FR-REP-LEARN-10: A node with no admissible move (all moves `refused` or `retired`) MUST be silent.
  The coach MUST NOT alert at such a node. It MUST appear in the gap report instead.

### FR-REP-GATE: Soundness gates

All four gates use data already stored in `move_evals`. Column names are authoritative: `win_before`,
`win_after`, `win_loss_pts` (not `win_loss`). Values are mover's point of view.

- FR-REP-GATE-1: **Per-move loss.** A move with `win_loss_pts < REP_ADMIT_WIN_PTS` (10) MUST be
  admitted. A move with `10 ≤ win_loss_pts < REP_QUARANTINE_WIN_PTS` (20) MUST be quarantined. A
  move with `win_loss_pts ≥ 20` MUST be refused. The boundary is half-open: exactly 10 quarantines,
  exactly 20 refuses.
- FR-REP-GATE-2: **Absolute floor.** A move that leaves `win_after < REP_MIN_ABS_WIN_PCT` (35) MUST
  be refused, *unless* no legal move at that node can achieve 35% — in which case this gate MUST be
  skipped and only gate 1 applies.
- FR-REP-GATE-3: **Cumulative line budget.** The minimum cumulative own-move `win_loss_pts` over all
  observed book paths from the root to this node MUST be `< REP_LINE_BUDGET_WIN_PTS` (20). If no
  observed book path exists yet, this gate MUST be skipped. `rep_nodes.line_loss` is this minimum; it
  MUST be recomputed whenever any upstream edge or move-loss value changes.
- FR-REP-GATE-4: **Forced-mate safety.** A move that delivers a forced mate against the player (i.e.
  the position after the move is a forced mate for the opponent) MUST be refused. This catches the
  residual tactical case not already excluded by gates 1–3.
- FR-REP-GATE-5: A depth-22 MultiPV-3 audit MUST be run and recorded in `rep_audits` before any
  move transitions to `canonical`. Every `rep_audits` row MUST carry `provenance_id` and
  `book_version`. Gate evaluation MUST NOT mix audit rows from different `REP_AUDIT_DEPTH` values.

### FR-REP-COACH: Live alert and takeback

- FR-REP-COACH-1: After a move is received from the client but **before** `session.applyMove` is
  called, the server MUST classify the move against the book (§FR-REP-BOOK).
- FR-REP-COACH-2: If the classification is in the alerting set, alerts remain within
  `REP_ALERTS_PER_GAME_MAX` (3), the game was started with `coach_enabled = 1`, and the book is past
  `REP_BOOTSTRAP_CONFIRMED_MIN` (20) confirmed nodes, the server MUST send a `repertoire_alert`
  message and hold the move pending a decision.
- FR-REP-COACH-3: While a move is held, the player's clock MUST be paused. It MUST resume when the
  decision arrives or the timeout fires.
- FR-REP-COACH-4: The first alert in a game MUST set `ranked = 0` on the game and emit a
  `ranked_changed { reason: 'repertoire_coach' }` WS event.
- FR-REP-COACH-5: The client MUST respond with `repertoire_choice { decision: 'correct' | 'keep' }`.
  No other fields are permitted. The Zod schema MUST reject any `repertoire_choice` carrying fields
  beyond `decision`.
- FR-REP-COACH-6: `decision = 'correct'` MUST cause the server to apply the canonical book move
  instead. The observation MUST be recorded with `source = 'coach_corrected'`.
- FR-REP-COACH-7: `decision = 'keep'` MUST cause the server to apply the player's move. A
  `rep_deviations` row with `resolution = 'alerted_kept'` and a `rep_challenges` row MUST be written
  in the same transaction as the move.
- FR-REP-COACH-8: If no `repertoire_choice` arrives within `REP_ALERT_TIMEOUT_SEC` (60) seconds, the
  server MUST apply the player's move. A `rep_deviations` row with `resolution = 'alerted_timeout'`
  MUST be written. No `rep_challenges` row MUST be opened. A timeout is NOT a refusal.
- FR-REP-COACH-9: A deviation past the `REP_ALERTS_PER_GAME_MAX` budget MUST be recorded in
  `rep_deviations` with `resolution = 'post_game'` and MUST NOT open a challenge row.
- FR-REP-COACH-10: The book check MUST use DB reads only. It MUST NOT call the engine. P99 latency
  for the check path MUST be < 20 ms.
- FR-REP-COACH-11: Any error in the repertoire check MUST be logged at `warn` and swallowed. It MUST
  NOT cause the move to be rejected or the game to fail. Exception: writing the `rep_challenges` row
  on a `decision = 'keep'` is inside the move transaction; if that write fails, the move MUST fail,
  because a silently-lost refusal is worse than a rejected move.
- FR-REP-COACH-12: `handleMove` in `src/api/ws/handlers.js` MUST receive `repertoireRepo` as an
  injected dependency. It MUST NOT import a module-level singleton.
- FR-REP-COACH-13: Each game has a `coach_enabled` flag (column `games.coach_enabled INTEGER NOT NULL
  DEFAULT 1`). When `coach_enabled = 0`, the coach MUST be silent for that game regardless of other
  conditions.
- FR-REP-COACH-14: Coached games (`coach_enabled = 1`) MUST NOT contribute to strength sampling.
  `saveStrengthSample` MUST be guarded with the same coached-game exclusion as the Elo update.

### FR-REP-CHAL: Refusals and challenger promotion

- FR-REP-CHAL-1: Every `alerted_kept` decision MUST produce a `rep_challenges` row recording the
  incumbent and challenger moves, the incumbent's statistics at that moment, `move_ms_taken`
  (from `game_moves.ms_taken`), and `decision_ms_taken` (how long the alert was held before the choice).
- FR-REP-CHAL-2: While a challenge is `open` at a node, the coach MUST NOT alert at that node (rule 8).
  The vote MUST be suspended at that node.
- FR-REP-CHAL-3: Evidence MUST accrue from plays, not alerts. `challenger_plays` counts the opening
  refusal plus unprompted replays of the challenger at the same node. `incumbent_plays` counts
  unprompted plays of the incumbent after the challenge opened.
- FR-REP-CHAL-4: Challenge resolution rules MUST be evaluated in the order below. The first matching
  rule wins and is recorded in `resolution_rule`. No rule may make a move `canonical` unless
  `challenger_plays ≥ REP_CONFIRM_OBS` (precondition, invariant 14).
  1. Gate veto: challenger fails any of the four gates → close `rejected_unsound`.
  2. Engine-clear: `engine_delta ≥ REP_CHALLENGE_ENGINE_CLEAR` (+2) → promote challenger.
  3. Repeat-plus-neutral: `challenger_plays ≥ REP_CHALLENGE_REPEAT_CONFIRM` (2) **and**
     `engine_delta ≥ −REP_CHALLENGE_ENGINE_TOL` (−3) → promote challenger.
  4. Evidence: `engine_delta` within tolerance **and** trend or Elo-adjusted performance favours
     challenger over ≥ `REP_CHALLENGE_MIN_GAMES` (6) → promote challenger.
  5. Style-call: `engine_delta < −REP_CHALLENGE_ENGINE_TOL` but challenger passes all four gates
     **and** Elo-adjusted results favour it by ≥ `REP_CHALLENGE_RESULT_MARGIN` over ≥
     `REP_CHALLENGE_MIN_GAMES` → promote challenger.
  6. Incumbent wins: `incumbent_plays ≥ 1` after the challenge opened, or trend and results both
     favour incumbent at full sample → close `rejected`.
  7. Abandoned: no repetition within `REP_CHALLENGE_TTL_ENCOUNTERS` (8) node encounters → close
     `abandoned`.
  8. *(While open)* Neither move alerts; vote is suspended.
  9. Alternation: both moves qualify under FR-REP-LEARN-6 → close `settled_both`;
     node holds `canonical` + `alt`.
- FR-REP-CHAL-5: `engine_delta` is defined as `winPct(challenger) − winPct(incumbent)`, positive =
  challenger better. The sign convention MUST be tested explicitly.
- FR-REP-CHAL-6: Elo-adjusted performance is `score − 1/(1 + 10^((opponent_elo − elo_before)/400))`,
  where `score ∈ {1, 0.5, 0}`, using columns already on `games`.
- FR-REP-CHAL-7: Promotion MUST write: incumbent → `retired`, challenger → `canonical`,
  `rep_changelog` row with `kind = 'promote'` and the rule and numbers that fired,
  drill card `accepted_moves_json` updated.
- FR-REP-CHAL-8: `POST /changelog/:id/reverse` MUST restore previous roles, close the challenge
  `rejected` with `resolved_by = 'user_override'`, and write a `rep_suppressions` row for
  `REP_REVERSAL_SUPPRESS_ENCOUNTERS` (10) node encounters during which no rule may re-promote that
  move and the vote is frozen at the node.

### FR-REP-REACH: Reach probability, coverage and gaps

- FR-REP-REACH-1: Reach probability of a node MUST be computed as the product of
  `maiaPolicy(reply)` over all opponent-to-move positions on the path, using the Maia weights nearest
  the player's current Elo (`nearestMaiaModel` + `getMaiaAnalysisWeights`).
- FR-REP-REACH-2: Reach probability MUST be cached per `(epd, maia_weights_id)` in `rep_policy`.
  It MUST NOT be computed on any request path. It MUST be recomputed in the background after each
  game's analysis when `reach_stale = 1`.
- FR-REP-REACH-3: **Coverage %** MUST be defined as:
  `Σ reach(n) over covered nodes / Σ reach(n) over all nodes at depth ≤ REP_PLY_MAX`.
  "Covered" means the node has a `canonical` move.
- FR-REP-REACH-4: The system MUST report **expected in-book depth**: the expected ply at which the
  next game will leave the book, weighted by reach probability.
- FR-REP-REACH-5: The **gap report** MUST list opponent replies with high policy probability at book
  nodes for which the player has no line. It MUST NOT invent moves.
- FR-REP-REACH-6: A node is in the "worth covering" frontier when `reach ≥ 1 / REP_COVERAGE_GOAL`.

### FR-REP-DRILL: FSRS integration

- FR-REP-DRILL-1: When a move transitions to `canonical`, the system MUST insert a
  `kind = 'opening'` row into `puzzles` and a corresponding `fsrs_cards` row.
- FR-REP-DRILL-2: `puzzles.best_move_uci` MUST be the `canonical` move. `puzzles.accepted_moves_json`
  MUST contain the canonical, alt, and any open challenger moves. It MUST NOT contain quarantined moves.
- FR-REP-DRILL-3: Opening drill cards MUST be exempt from the `FINDABILITY_MIN` filter in
  `src/domain/puzzles/select.js`, `src/domain/review/queue.js`, and `src/domain/review/rating.js`.
- FR-REP-DRILL-4: The `puzzles` table's current `UNIQUE(fen)` constraint MUST be replaced with
  `UNIQUE(fen, kind)` to allow the same FEN to appear as both a tactics and an opening card.
- FR-REP-DRILL-5: Due opening cards in the drill queue MUST be sorted by reach probability,
  highest first (highest-reach positions drilled first).

### FR-REP-STORE: Persistence and rebuildability

- FR-REP-STORE-1: `rep_observations`, `rep_deviations`, `rep_challenges`, `rep_audits` and
  `rep_changelog` are append-only. Nothing but a cascaded game deletion MAY remove rows.
- FR-REP-STORE-2: Every row in an append-only table MUST carry non-null `provenance_id` and
  `book_version`.
- FR-REP-STORE-3: `rep_nodes` and `rep_moves` MUST be fully derivable from `rep_observations +
  rep_challenges + rep_audits + rep_suppressions + move_evals + balance constants`. No other input
  is required.
- FR-REP-STORE-4: `scripts/seed-repertoire.js --rebuild` MUST recompute all projections from the
  append-only tables without reading the existing projections. Two consecutive rebuilds MUST produce
  byte-identical results.
- FR-REP-STORE-5: `book_version` MUST be a strictly monotonic integer, incremented exactly once per
  book change in the same transaction as that change.
- FR-REP-STORE-6: Two exports of the same database at the same `book_version` MUST be byte-identical.
  Wall-clock time, hostname, run ID, and iteration order MUST NOT reach the exported bytes.
- FR-REP-STORE-7: `games.coach_enabled INTEGER NOT NULL DEFAULT 1` MUST be added via an `ALTER TABLE`
  in-try migration (same pattern as `schema.js:15-17`).

### FR-REP-API: REST and WebSocket surface

- FR-REP-API-1: The following REST routes MUST be served at `/api/repertoire`:
  - `GET /tree` — book DAG with node roles and reach probabilities
  - `GET /coverage` — coverage %, expected in-book depth, gap list
  - `GET /challenges` — open and recently resolved challenges (read-only)
  - `GET /refusals` — refusal log with inferred interpretation, signal values and outcome
  - `GET /changelog` — book change feed
  - `POST /changelog/:id/reverse` — one-click reversal
- FR-REP-API-2: WebSocket messages added:
  - Outbound: `repertoire_alert { kind, playedUci, bookUci, winPctCost }` (held move notification)
  - Inbound: `repertoire_choice { decision: 'correct' | 'keep' }` — no other fields
  - Outbound: `ranked_changed { reason: 'repertoire_coach' }`
  - Outbound: `repertoire_update { confirmed, candidates, newChallenges }` (post-game summary)
- FR-REP-API-3: The `repertoire_choice` Zod schema MUST use `.strict()` so no additional field passes
  validation. `decision` MUST accept only the literal union `'correct' | 'keep'`.
- FR-REP-API-4: `src/api/routes/repertoire.js` MUST be mounted in `src/server.js` as part of
  Phase 22 without modifying the Phase 21 alert flow.

---

## I — Interface and schema definitions

Detailed column-by-column schemas are in `data_model.md`. Message shapes in `api_contract.md`.
Zod schemas in `src/schemas/messages.js`. Key contract points:

- `(epd, side, move_uci)` is the natural key for a book move. Role is a single enum column.
- `rep_challenges.status ∈ ('open','promoted','rejected','rejected_unsound','abandoned','settled_both')`
- `rep_deviations.resolution ∈ ('alerted_corrected','alerted_kept','alerted_timeout','post_game')`
- `rep_observations.source ∈ ('game','coach_kept','coach_corrected')`
- `rep_changelog.kind ∈ ('promote','retire','confirm','refuse','settle','reverse')`

---

## P — Preconditions

- P-COACH-1: The coach MUST be silent while `book_confirmed_count < REP_BOOTSTRAP_CONFIRMED_MIN`.
- P-COACH-2: The coach MUST be silent for games with `coach_enabled = 0`.
- P-COACH-3: An alert MUST NOT be raised at a node with no `canonical` move, even for moves in the
  alerting set. If the only canonical move was retired and the node holds a refused move, the refused
  move falls through to `new_territory`.
- P-CHAL-1: No challenge rule may promote a move with fewer than `REP_CONFIRM_OBS` (2) self-directed
  observations. A single-observation challenger with a strong engine score MUST be admitted as `alt`,
  not `canonical`.
- P-GATE-1: Gate 2 (absolute floor) MUST NOT apply when no legal move at the node can reach
  `REP_MIN_ABS_WIN_PCT`.
- P-GATE-2: Gate 3 MUST NOT apply when no observed book path to the node yet exists.

---

## Q — Postconditions and invariants

1. At most one `canonical` move per `(epd, side)`; exactly one role per `(epd, side, move_uci)`.
2. A move whose role is `refused` or `retired` MUST NOT be in the accepted set. A `quarantined` move
   MUST NOT be `canonical` and MUST NOT be any drill card's `best_move_uci`.
3. `rep_observations`, `rep_deviations`, `rep_challenges`, `rep_audits` and `rep_changelog` are
   append-only; nothing but a cascaded game deletion may remove a row.
4. `rep_nodes` and `rep_moves` MUST be byte-for-byte reproducible from `rep_observations +
   rep_challenges + rep_audits + rep_suppressions + move_evals + balance constants`.
5. Every `rep_challenges` row references an existing `(epd, side)` node and a real incumbent move.
6. A challenge with `status != 'open'` MUST have `resolved_at`, `resolved_by` and `resolution_rule`.
7. A node with a `canonical` move MUST have a `kind='opening'` puzzle row and an FSRS card.
   **Activates at Phase 23** — written as `test.fails(...)` until then.
8. No move becomes `canonical` without a `rep_audits` row at `REP_AUDIT_DEPTH` that passes all four
   gates.
9. `ranked = 0` for every game with at least one `rep_deviations` row whose resolution begins
   `alerted_`.
10. A challenge resolves only via one of the numbered rules in §FR-REP-CHAL-4 or an explicit user
    reversal. No schema column anywhere stores a user-supplied classification of a move or a refusal.
11. Every append-only row carries a non-null `provenance_id` and `book_version`.
12. `book_version` is strictly monotonic and increments exactly once per book change, in the same
    transaction as that change.
13. Two exports at the same `book_version` are byte-identical. No wall-clock time, hostname, path,
    run ID, or map-iteration order reaches the exported bytes.
14. No move becomes `canonical` on fewer than `REP_CONFIRM_OBS` self-directed observations — via the
    vote or via any challenge rule.
15. A `rep_deviations` row with `resolution ∈ ('alerted_timeout','post_game')` MUST NOT have an
    associated `rep_challenges` row.

---

## N — Non-functional constraints

1. Live book check: zero engine calls; DB reads only; p99 < 20 ms. Verified by a test asserting the
   engine client is never touched on the live path.
2. A refusal MUST be durably committed in the same transaction as the move it belongs to. A failed
   write of `rep_challenges` on a `decision = 'keep'` MUST fail the move, not swallow the error.
3. Post-game repertoire update: zero additional engine calls beyond the bounded promotion audit and
   challenge A/B (≤ 2 `go depth 22` calls per open challenge, at most once per challenge lifetime).
4. Maia policy probes are background-only, cached, never on a request path.
5. Any internal repertoire error MUST be logged at `warn`/`error` and swallowed, except N-2 above.
   It MUST NOT fail a move, a game, or an analysis run.
6. Coached games MUST be excluded from strength sampling (`saveStrengthSample` must be guarded by
   the same condition as the Elo update).

---

## Error codes (additions to `src/errors.js`)

| Code | Class | HTTP | Condition |
|---|---|---|---|
| `REP_NODE_NOT_FOUND` | `RepertoireNodeNotFoundError` | 404 | EPD not in book |
| `CHALLENGE_NOT_OPEN` | `ChallengeNotOpenError` | 409 | Reversal on non-open challenge |
| `NO_PENDING_MOVE` | `NoPendingMoveError` | 409 | Choice with no held move |
| `REP_MOVE_REFUSED` | `RepertoireMoveRefusedError` | 422 | Gate check failure at admit time |
| `INVALID_REP_DECISION` | `InvalidRepertoireDecisionError` | 400 | `decision` not in `{correct,keep}` |

Internal repertoire errors are logged and swallowed, not raised as HTTP errors.

---

## Reconciliation with FR-PLAY-11

FR-PLAY-11 states: *"A ranked game MUST NOT expose eval or hints."*

A coached game is flipped to unranked (`ranked = 0`) at the first alert (FR-REP-COACH-4). The coach
alert reveals the existence of a book move but does not expose a numerical eval. This reconciliation
MUST be stated explicitly: the alert is permitted because the game becomes unranked before the alert
is visible to the client.
