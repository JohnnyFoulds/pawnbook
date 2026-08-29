# Design decisions — auto-repertoire

**Status:** Phase 17 — 2026-08-29  
Decision log with rationale and rejected alternatives. The *why* survives here even when the code
is rewritten. Decisions flagged ★ are places where the obvious implementation is the wrong one.

---

## D-1: Seeds come only from pawnbook games

**Decision:** The book learns only from games played inside pawnbook. No PGN import, no hand-written
seed lines.

**Rationale:** The research instrument (§10) needs to capture every deviation from the moment of
the first game. An imported PGN represents a game played without the coach, so no refusals were
recorded and no provenance exists. Allowing imports would make the book's provenance incomplete from
the start, confound RQ1 (refusal hit-rate), and mean the book contains lines that were never
decision-points under measurement. It would also introduce a hand-curation step, contradicting D-3.

**Rejected:** "Seed with PGN on first run" — rejected because it bypasses the encounter-driven
formation that the paper's methodology claims.

---

## D-2: Alert + takeback always; first alert flips the game unranked

**Decision:** Every deviation alert offers a takeback. There is no "silent log only" mode. The first
alert in a game sets `ranked = 0` immediately.

**Rationale:** The one-bit signal (keep/correct) is only available if the alert fires. Suppressing
the alert to preserve ranked status would eliminate the data the instrument exists to collect. The
game becomes unranked because (a) a coached game is no longer a fair strength measurement and (b)
this is how FR-PLAY-11 (no eval in ranked games) is reconciled with the alert — the flip happens
before the alert is visible to the client.

**Rejected:** "Alert without flipping ranked" — would violate FR-PLAY-11.  
**Rejected:** "Flip ranked only if the player accepts the correction" — would suppress alerts in
games where the player keeps playing his own moves, eliminating the most interesting data.

---

## D-3: No classification at the alert; one bit only ★

**Decision:** The `repertoire_choice` message carries exactly one field: `decision ∈ {correct, keep}`.
No reason tag, no "is this a misclick?" button, no "should this enter the book?" question. The Zod
schema uses `.strict()` to make adding fields a hard error rather than a soft drift.

**Rationale:** The user stated this explicitly: *"I don't want to classify, the model and learning
algorithm should be smart enough to record it."* Beyond respecting that preference, forced
classification at a decision point under time pressure produces noisy labels — people classify
quickly and carelessly. The four interpretations (misclick, experiment, change of mind, regretted
lapse) are fully distinguishable from `challenger_plays`, `incumbent_plays`, `move_ms_zscore` and
`decision_ms_taken` without burdening him. The one-bit label is also what the novelty claim in the
prior-art survey rests on (§5 item 2 of `auto-repertoire-prior-art.md`): existing systems don't have
a human in the loop at the moment of deviation, and adding a classification field would turn the
label from ground truth into an annotation and reduce its scientific value.

**Design review note (R3):** This means a single misclick that the engine likes must NOT become
`canonical` (rule 2 of the challenge spec required the global precondition of `REP_CONFIRM_OBS`
observations to prevent this — adding a misclick button would be the wrong fix).

---

## D-4: Pre-commit hold, not a post-commit undo

**Decision:** The move is checked before `session.applyMove`. If an alert is warranted, the move is
held, the client receives `repertoire_alert`, and the clock is paused. From the player's perspective
it looks exactly like a takeback, but no state has been rolled back.

**Rationale:** A true takeback after `applyMove` would require rolling back: the `game_moves` row,
the persisted pre-eval, the clock tick, and any engine response already dispatched. The pre-commit
hold has none of these costs. The clock pause is essential — the coach must not cost him time.

**Rejected:** "True undo after applyMove" — too many rollback surfaces; the engine may have already
responded.

---

## D-5: EPD keying, not move-sequence keying ★

**Decision:** Book nodes are keyed by EPD (first four FEN fields). Transpositions are free.

**Rationale:** This is the established field standard (Chessdriller, Repertree, the opening-elo-book
already in `calibration/`). A move-sequence tree would require separate entries for every order in
which he reaches a position, multiplying the data and producing spurious deviations for identical
positions.

---

## D-6: Reach probability from Maia policy, not crowd statistics

**Decision:** `p(opponent plays r | position)` is read from the Maia model at the player's Elo,
not from Lichess crowd statistics.

**Rationale:** pawnbook's opponents *are* Maia at a known Elo. The policy probability is exact and
calibrated to the actual pool played against. RQ5 is a clean calibration study precisely because
the opponent's policy is known rather than estimated. Using Lichess statistics would require a crawl,
introduce a cold-start problem, and measure a different population.

---

## D-7: Encounter-driven expansion, not search-driven

**Decision:** A node enters the book only when a real game reaches it. Reach probability is used for
prioritisation, coverage stats and gap reporting — never to invent moves.

**Rationale:** The user stated: *"things I actually encountered."* Search-driven expansion (Lincke's
drop-out, AlphaZero-style) generates positions the player has never seen and may not understand.
Encounter-driven expansion keeps the book honest about what is actually in play.

**Consequence:** The first N games are silent observation. This is expected and must be communicated
in the UI.

---

## D-8: Automatic promotion within the gates ★

**Decision:** Challenger promotion is fully automatic. The changelog shows what changed and why, and
a one-click reversal is available, but no change ever waits for approval.

**Rationale:** An approval queue puts the user back in the classification seat he rejected in D-3,
just one step later. It also creates a maintenance burden: queued items pile up, get ignored, and
the book stops growing. The four gates are the quality control; the reversal is the escape valve.
Automatic promotion is also what makes zero-curation-cost (novelty claim §5 item 5) true.

**Design review note (R7):** The reversal must actually stick — the next learning pass must not
re-fire on identical evidence. The `rep_suppressions` table and `REP_REVERSAL_SUPPRESS_ENCOUNTERS`
are the mechanism. Without them the reversal button is cosmetic.

---

## D-9: Evidence accrues from plays, not alerts ★

**Decision:** `challenger_plays` counts the opening refusal plus *unprompted* replays of the
challenger. `incumbent_plays` counts unprompted plays of the incumbent after the challenge opened.
Rules phrased as "refusals ≥ N" are forbidden.

**Rationale (design review R1):** Rule 8 silences the node while a challenge is open, so a second
refusal at the same node can never occur. Any rule requiring two refusals would be permanently
unreachable — the documented "common path" for adoption could never fire. Unprompted repeats are
also a cleaner signal: playing a move *without an alert to react to* is cleaner evidence of
preference than pressing a button would be. Rules 3 and 6 are exactly symmetric because of this.

---

## D-10: Coach-corrected observations excluded from confirmation and vote ★

**Decision:** `source = 'coach_corrected'` observations are recorded in `rep_observations` but
MUST NOT count toward `observations` for promotion and MUST NOT contribute to the recency-weighted
vote (FR-REP-LEARN-2).

**Rationale (design review R2):** Without this exclusion, every accepted takeback gives the
incumbent one more vote for being the incumbent. The vote freezes, RQ2/RQ3 measure the coach rather
than the player, and the book reinforces itself rather than following him as his play changes. This
is the most important single line in the design.

---

## D-11: Tolerant-but-blunder-proof gate thresholds

**Decision:** `REP_ADMIT_WIN_PTS = 10`, `REP_QUARANTINE_WIN_PTS = 20`. These mirror
`INACCURACY_WIN_PTS` and `MISTAKE_WIN_PTS` from `balance.js`. Style-tolerant: accepts inaccuracies
that suit his play. Hard-stop on blunders.

**Rationale:** Every tool in §1 of the prior-art survey treats engine agreement as the objective.
This system optimises for his outcomes. A move that costs 8 win% points but he plays consistently
and produces good results is *his* move. But a move that loses 20+ points has no results-based
justification — it is objectively bad regardless of style.

**Prior art divergence:** chessdesk.app has a soundness gate but at a per-tool-defined threshold,
not per-player-performance-measured. See `auto-repertoire-prior-art.md §1`.

---

## D-12: Candidate TTL in node encounters, not games played

**Decision:** `REP_CANDIDATE_TTL_ENCOUNTERS = 8` measures encounters at the node.

**Rationale (design review R6):** A node reached once every 12 games would expire its candidate
before the player could see it a second time if the TTL counted global games. The deep infrequent
lines the feature exists to grow would never confirm. The cost of encounter-counting is that a
misclick at a very rare node lingers as a candidate effectively forever — harmless, because
candidates are invisible and never promoted.

---

## D-13: `rep_audits` as append-only table

**Decision:** Every depth-22 audit is written to `rep_audits` rather than inlined as columns on
`rep_moves`.

**Rationale (design review R8):** An engine measurement cannot be recomputed from `rep_observations`
alone. Without this table, `rep_moves.audit_id` would point at nothing a rebuild can reconstruct,
and invariant 4 would be false. The table is also what makes RQ1/RQ3 engine-side data auditable with
full provenance, and what makes the gate-3 audit-depth consistency check possible.

---

## D-14: `book_version` NOT in `rep_provenance`

**Decision:** Provenance rows do NOT carry `book_version`. Both are stamped on every append-only
row as independent columns.

**Rationale:** `book_version` increments on every book change — orders of magnitude more often than
the engine/balance/git context. Including it in `rep_provenance` would force a new row per book
change and destroy the reuse the table exists for. They are orthogonal measurements.

---

## D-15: Per-game coach toggle needs a schema home

**Decision:** `games.coach_enabled INTEGER NOT NULL DEFAULT 1`, added via ALTER-in-try migration.

**Rationale:** The coach toggle is not a client-side preference — the analyses in §10 must be able
to distinguish a game where the coach was silent because it was disabled from one where it was silent
because the player stayed in book. Without the column the distinction is irretrievable.

See also: RQ4 confound note in `design_plan.md §Open items`.

---

## D-16: Timeout is not a refusal ★

**Decision:** `REP_ALERT_TIMEOUT_SEC = 60` auto-applies the player's move and writes
`resolution = 'alerted_timeout'`. It MUST NOT open a `rep_challenges` row.

**Rationale (design review R4):** A player who walks away from the keyboard has not expressed a
preference about the book move. Treating the absence of input as a deliberate judgement would
silently poison the one-bit label the novelty claim rests on. The integrity of the label is worth
more than slightly higher coverage of edge cases.

---

## D-17: `rep_suppressions` for reversal durability

**Decision:** `POST /changelog/:id/reverse` writes a `rep_suppressions` row for
`REP_REVERSAL_SUPPRESS_ENCOUNTERS` (10) encounters. During this window no rule may re-promote the
move and the vote is frozen at the node.

**Rationale (design review R7):** Without suppression, the next learning pass sees the same
unchanged evidence, fires the same rule, and the change the user just rejected reappears immediately.
A reverse button that does nothing on the next pass is worse than no reverse button — it gives false
confidence that the book is under control.

---

## D-18: Row 1 in the deviation table carries the has-canonical condition ★

**Decision:** In the classification table (§5), row 1 (`refused_repeat`) explicitly includes "and
the node has a `canonical` move to offer" as a condition.

**Rationale:** `refused_repeat` sits first in the first-match-wins table, so it cannot rely on
falling through to row 4 (`new_territory`) for the no-canonical-move check — it will never reach
row 4 if it matches. A refused move at a node whose only canonical move was retired would raise an
alert with no "Play book move" to offer, violating FR-REP-LEARN-10. With the condition in the row,
a refused move at an empty node falls through to `new_territory` (silent). This is tested explicitly
(regression test 8 in `feature_spec.md §Verification`).

---

## D-19: `line_loss` is the minimum over observed book paths

**Decision:** `rep_nodes.line_loss` = minimum cumulative `win_loss_pts` over all *observed* book
paths from the initial position to the node.

**Rationale (design review R5):** A DAG has no single path. The alternatives:
- *Played path* — penalises a node for a bad approach that was never repeated; unstable and
  order-dependent.
- *Maximum* — makes transpositions harmful: a node reachable via one clean path and one sloppy path
  would be blocked by the sloppy path, defeating §1 (transposition-safety).
- *Minimum* — a node is admissible if *some* sound book line reaches it. This is the correct
  semantics for "does my repertoire support this position".

Gate 3 is skipped when no observed book path yet exists, to avoid refusing every first-encounter
node (P-GATE-2).
