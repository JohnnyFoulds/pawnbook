# User journey — auto-repertoire (30 days)

**Status:** Phase 28 — 2026-08-30  
**Authority:** Non-normative narrative. Where this document contradicts `feature_spec.md`, the spec
wins and this document is a journey bug. Each stage here becomes an assertion in `tests/support/journey/journeys/v1.js`.

---

## Overview

Johannes plays chess daily. He has configured pawnbook to learn his opening repertoire automatically.
`data/chess.db` starts at 0 games. He plays with `coach_enabled = 1` (default) until day 20 when one
game runs with `coach_enabled = 0` for the RQ4 measurement. The journey spans 30 simulated days and
approximately 55 games.

**Fixtures:** All games in this journey use scripted move sequences from `simulation_fixtures.md`.
Move evaluations are injected programmatically; no engine binary is ever called.

---

## Act I — Onboarding (Days 1–9)

The book is empty. The coach is silent. Moves are learned silently as candidates, then confirmed.

---

### Stage 1.1 — First game (Day 1)

**What Johannes does:** Starts a game against Maia-1100, plays the `book_conforming_white` line
(1.e4 e5 2.Nf3 Nc6 3.Bb5, 4 own plies), wins.

**What he sees:**
- After the game: analysis runs, repertoire panel shows "5 new positions observed" with no
  confirmations yet. No `repertoire_alert` was sent during the game.

**Requirements:** FR-REP-LEARN-1 (every own ply within REP_PLY_MAX produces an observation),
FR-REP-LEARN-3 (first observation → candidate), FR-REP-BOOK-7 (candidate is invisible to coach).

> **Postcondition:** `rep_observations` has 4 rows for this game. `rep_moves` has 4 rows, all with
> `role = 'candidate'` and `observations = 1`. No `rep_changelog` rows. No `repertoire_alert` event
> was emitted during the game.

---

### Stage 1.2 — Second and third games (Days 2–3)

**What Johannes does:** Plays the same `book_conforming_white` line twice more (one per day).

**What he sees:**
- Day 2: post-game panel "0 confirmed, 5 new observations recorded".
- Day 3: `REP_CONFIRM_OBS = 2`, so moves first seen on Day 1 now have 2 observations.
  Post-game panel reports "4 confirmed positions" for the four plies he has now played twice.

**Requirements:** FR-REP-LEARN-4 (candidate → confirmed when observations ≥ REP_CONFIRM_OBS and
gates pass), FR-REP-GATE-1/2/3 (soundness gates evaluated), FR-REP-STORE-1/2.

> **Postcondition:** 4 `rep_moves` rows now have `role = 'canonical'` (all pass gates at the fixture
> CP values). 4 `rep_changelog` rows with `kind = 'confirm'`. `rep_nodes.line_loss` is non-null for
> each node. No alert was fired. The `repertoire_update` WS message carries `confirmed_count = 4`.

---

### Stage 1.3 — Days 4–5: candidate accumulation

**What Johannes does:** Plays 2 more games using `book_divergent_white` — same first 3 plies as
before, then a different 4th ply (1.e4 e5 2.Nf3 Nc6 3.Bd3 instead of 3.Bb5).

**What he sees:**
- Post-game panel: "1 confirmed, 1 new candidate (ply 3 diverges from previous games)".
- The Bd3 move appears as a candidate at the ply-3 node after day 4.
- After day 5 (second play of Bd3), Bd3 could confirm if gates pass — but it does not in this
  fixture because the eval band puts it in the quarantine range.

**Requirements:** FR-REP-LEARN-4 (gate evaluation at confirmation), FR-REP-GATE-1 (quarantine band),
FR-REP-BOOK-3 (move role assignment).

> **Postcondition:** The Bd3 candidate has `observations = 2`, `role = 'quarantined'` (fixture
> `win_loss_pts = 14`, within `[REP_ADMIT_WIN_PTS, REP_QUARANTINE_WIN_PTS)` = `[10, 20)`).
> `rep_changelog` has a `kind = 'quarantine'` entry for this move.

---

### Stage 1.4 — Days 6–7: bootstrap threshold

**What Johannes does:** Plays 4 more `book_conforming_white` games (2 per day) to accumulate
confirmed nodes. By end of Day 6 the 20th canonical node is confirmed, crossing `REP_BOOTSTRAP_CONFIRMED_MIN = 20`.

**What he sees:** No alerts yet — bootstrap threshold is crossed silently. Next game can trigger an alert.

**Requirements:** FR-REP-COACH-2 (bootstrap guard: ≥ 20 confirmed nodes), FR-REP-COACH-1 (book
check fires pre-move).

> **Postcondition:** `SELECT count(*) FROM rep_moves WHERE role = 'canonical'` ≥ 20. The next
> game is eligible for alerts. No `rep_deviations` rows yet.

---

### Stage 1.5 — Day 8: repertoire_update reaches the client

**What Johannes does:** Plays a `book_conforming_white` game normally. Observes the browser console.

**What he sees:** The browser (or fake WS event log in the harness) receives a `repertoire_update`
message immediately after analysis completes.

**Requirements:** FR-REP-STORE (update emitted), U5 fix (client handles `repertoire_update`).

> **Postcondition (harness event probe):** The event log contains exactly one `repertoire_update`
> message for this game with `type = 'repertoire_update'` and numeric `book_version`. This stage
> **currently fails** — U5 is open and the client does not handle the message (the harness event
> probe will fail until Phase 30 closes U5).

---

### Stage 1.6 — Day 9: single observation is never canonical

**What Johannes does:** Plays a short game (`book_extra_ply`) that reaches one position not seen
before (ply 5, the first time a 5th ply appears in this line).

**What he sees:** No confirmation of the new position. Post-game panel shows "1 new candidate".

**Requirements:** FR-REP-LEARN-3 (single observation never canonical).

> **Postcondition (invariant probe):** No `rep_moves` row with `observations = 1` has
> `role = 'canonical'`. This is invariant 6 from `feature_spec.md §NFR-INV`.

---

## Act II — The coach (Days 10–20)

The bootstrap threshold is crossed. The coach is live.

---

### Stage 2.1 — Day 10: first alert, accept (takeback)

**What Johannes does:** Plays `book_lapse_white` — the first 3 plies match the book, but ply 4 plays
`refused_move_uci` (a move that was previously refused by the gates on Day 5). The server holds the move
and sends `repertoire_alert` with `kind = 'lapse'`. Johannes sends `repertoire_choice { decision: 'correct' }`.

**What he sees:**
- Alert overlay appears with the book move highlighted.
- He clicks "Correct". The board updates to the canonical ply-4 move.
- After the game: the ranked badge changes to "Unranked" with reason `repertoire_coach`.

**Requirements:** FR-REP-COACH-1 through FR-REP-COACH-6, FR-REP-COACH-4 (`ranked_changed` emitted),
B1 fix (`ranked_changed` WS event is sent).

> **Postcondition:**
> - `rep_deviations` has 1 row: `kind = 'lapse'`, `resolution = 'alerted_correct'`.
> - `games` row has `ranked = 0`.
> - Event log contains `ranked_changed { reason: 'repertoire_coach' }`.
> - This stage **currently fails** on the `ranked_changed` event — B1 is open.

---

### Stage 2.2 — Day 11: order_slip alert

**What Johannes does:** Plays `book_order_slip_white` — the correct moves but in a different order
(transposition within the book). E.g. 1.e4 Nc6 2.Nf3 e5 reaches the same EPD as 1.e4 e5 2.Nf3 Nc6
but via a different order. The coach classifies this as `order_slip` (deviation-type from `deviation.js`).

**What he sees:** Alert overlay with `kind = 'order_slip'`. He sends `keep`.

**Requirements:** FR-REP-COACH-2, B2 fix (`_checkBookAlert` routes through `deviation.js`).

> **Postcondition:**
> - `rep_deviations` row has `kind = 'order_slip'`.
> - **Currently fails** — B2 is open and `_checkBookAlert` does not call `deviation.js`. The actual
>   kind will be `lapse` until Phase 32 closes B2.

---

### Stage 2.3 — Day 12: refusal, challenge opens

**What Johannes does:** Plays `book_refused_white` — ply 4 is a move in the alerting set. Alert fires.
He sends `repertoire_choice { decision: 'keep' }`.

**What he sees:**
- Alert overlay. He clicks "Keep my move".
- After the game: post-game panel notes "1 refusal recorded, 1 challenge opened".

**Requirements:** FR-REP-COACH-7 (keep writes `rep_deviations` + `rep_challenges` in same tx),
FR-REP-CHAL-1, FR-REP-CHAL-2 (challenge suppresses further alerts at this node).

> **Postcondition:**
> - `rep_deviations` row: `resolution = 'alerted_kept'`.
> - `rep_challenges` row: `status = 'open'`, `challenger_uci` = refused move, `incumbent_uci` = canonical.
> - No further `repertoire_alert` will fire at this node until the challenge closes.

---

### Stage 2.4 — Days 13–14: challenge node stays silent, challenger confirmed

**What Johannes does (Day 13):** Plays `book_conforming_white`. On the challenge node, plays the
canonical move unprompted. No alert fires (FR-REP-CHAL-2). `incumbent_plays` increments.

**What Johannes does (Day 14):** Plays `book_refused_white` again — returns to the challenge node
and plays the challenger move unprompted. `challenger_plays` now ≥ `REP_CHALLENGE_REPEAT_CONFIRM (2)`.
At analysis time, injected eval provides `engine_delta ≥ −REP_CHALLENGE_ENGINE_TOL` (−3), satisfying
rule 3. The challenge resolves: challenger promotes to `canonical`.

**What he sees (Day 14):** Post-game panel shows "1 promotion (rule 3): [move] is now your book move at [position]".

**Requirements:** FR-REP-CHAL-3 (evidence accrual), FR-REP-CHAL-4 rule 3 (repeat-plus-neutral),
FR-REP-CHAL-7 (promotion writes changelog), B7 fix (`engine_delta_win_pts` computed in `_gatherEvidence`).

> **Postcondition:**
> - `rep_challenges` row: `status = 'closed'`, `resolution_rule = '3'`.
> - `rep_changelog` row: `kind = 'promote'`, `rule = '3'`.
> - Previous incumbent has `role = 'retired'`; challenger has `role = 'canonical'`.
> - **Currently fails** — B7 is open: `engine_delta_win_pts` is never computed, so rule 3 cannot fire.

---

### Stage 2.5 — Day 15: reversal (Undo)

**What Johannes does:** On the post-game panel he clicks the Undo button next to the day-14 promotion.
`POST /api/repertoire/changelog/:id/reverse` is called.

**What he sees:** The promotion is reversed. The promoted move reverts to `retired` (or challenger),
and the previous canonical is restored. A suppression is written for 10 encounters.

**Requirements:** FR-REP-CHAL-8 (reverse restores roles, closes challenge, writes suppression), U3 fix
(Undo button is present in the UI).

> **Postcondition:**
> - `rep_challenges` row: `resolved_by = 'user_override'`.
> - `rep_suppressions` row created for this node.
> - `rep_changelog` row: `kind = 'reversal'`.
> - **Currently fails** — U3 is open: no Undo button is rendered anywhere in the current UI.

---

### Stage 2.6 — Day 16: alert timeout, no challenge

**What Johannes does:** Plays `book_lapse_white`. Alert fires. He does not respond within
`REP_ALERT_TIMEOUT_SEC` (simulated by calling `scheduler.fireAll()` in the harness). The server
applies the player's move automatically.

**What he sees:** The move is applied. No challenge was opened.

**Requirements:** FR-REP-COACH-8 (timeout → `alerted_timeout`, no challenge row).

> **Postcondition:**
> - `rep_deviations` row: `resolution = 'alerted_timeout'`.
> - No `rep_challenges` row for this timeout event.
> - Invariant 15 holds: `alerted_timeout` never creates a challenge.

---

### Stage 2.7 — Day 17: coach-off game

**What Johannes does:** Starts a game with `coach_enabled = 0`. Plays the lapse move. No alert fires.

**What he sees:** No alert overlay. The move is accepted immediately.

**Requirements:** FR-REP-COACH-13, RQ4 lever (coach_enabled flag controls alert suppression).

> **Postcondition:**
> - `games` row: `coach_enabled = 0`.
> - No `rep_deviations` row for this game.
> - No `repertoire_alert` event in the game's event log.

---

### Stage 2.8 — Days 18–19: strength-sample exclusion

**What Johannes does:** Plays two coached games (alerts fired but player corrected both). Plays one
uncoached game.

**What he sees:** Normal play.

**Requirements:** FR-REP-COACH-14 (coached games excluded from strength sampling), B9 fix.

> **Postcondition (harness state probe):**
> - `strength_samples` table (when implemented in Phase 32) has 0 rows sourced from the two coached games.
> - This stage is a placeholder: the guard is a comment in Phase 28, not yet implemented.

---

### Stage 2.9 — Day 20: repertoire_update client handling

**What Johannes does:** Plays a `book_conforming_white` game; observes network traffic or
`ws._sent` log in the harness.

**Requirements:** U5 fix — client handles `repertoire_update`.

> **Postcondition:** `repertoire_update` message is present in `ws._sent`; its `book_version`
> integer is ≥ 1. Stage passes once Phase 30 ships.

---

## Act III — Maturity (Days 21–30)

The book has 25+ canonical nodes. Maintenance cycles clean up edge cases.

---

### Stage 3.1 — Day 21: quarantine exit on re-audit

**What Johannes does:** Plays `book_quarantine_exit_white` — reaches the Bd3 node (quarantined on
Day 5). This triggers a re-audit (injected eval has `win_loss_pts = 7`, below `REP_ADMIT_WIN_PTS = 10`).

**What he sees:** Post-game panel: "1 quarantine exit — Bd3 is now an alt move".

**Requirements:** FR-REP-LEARN-8 (clean re-audit → `alt`), B5 fix (`reAuditQuarantined` has a caller).

> **Postcondition:**
> - `rep_moves` row for Bd3: `role = 'alt'`.
> - `rep_changelog` row: `kind = 'quarantine_exit'`.
> - **Currently fails** — B5 is open: `reAuditQuarantined` has no caller.

---

### Stage 3.2 — Day 22: candidate expiry

**What Johannes does:** `advanceDay(1)` runs maintenance. A candidate at a rare node has not been
seen in `REP_CANDIDATE_TTL_ENCOUNTERS = 8` encounters at that node.

**What he sees:** Nothing visible (silent expiry per FR-REP-LEARN-9).

**Requirements:** FR-REP-LEARN-9 (candidate TTL in node encounters, not games), B4 fix.

> **Postcondition:**
> - The expired candidate's row is removed (or marked `role = 'expired'` per implementation).
> - No `rep_changelog` row (expiry is silent).
> - **Currently fails** — B4 is open: `candidateExpired` check has no caller.

---

### Stage 3.3 — Days 23–24: coverage % and gap report appear

**What Johannes does:** Completes 2 games. Background Maia policy run completes.

**What he sees:** `GET /api/repertoire/coverage` returns a non-zero percentage. `GET /api/repertoire/gaps`
returns ≥ 1 gap entry.

**Requirements:** FR-REP-REACH-2/3/5 (coverage %, gap report), B8 fix.

> **Postcondition:**
> - `rep_policy` table has ≥ 1 row.
> - `GET /api/repertoire/coverage` response: `{ coverage: <number in (0,100)> }`.
> - `GET /api/repertoire/gaps` response: array with ≥ 1 gap entry.
> - **Currently fails** — B8 is open: `reach.js` has no caller.

---

### Stage 3.4 — Day 25: opening cards in drill

**What Johannes does:** Opens the drill screen. Opening FSRS cards appear alongside tactical cards.
Each opening card is visually labelled "Opening" (not just "Tactics").

**What he sees:** Opening card with a label/badge distinguishing it from a tactical puzzle.

**Requirements:** FR-REP-DRILL-1/2/3, U7 fix (opening cards labelled in drill).

> **Postcondition:**
> - At least one `puzzles` row with `kind = 'opening'` exists.
> - `GET /api/drill/due` response includes ≥ 1 opening card.
> - **Currently fails** — U7 is open: opening cards are not visually distinguished.

---

### Stage 3.5 — Day 26: refusal log with hit-rate

**What Johannes does:** Opens the repertoire page. The refusal log tab shows past refusals with a
running hit-rate: "N of M refusals became book moves (X%)".

**Requirements:** U2 fix, FR-REP-STORE-1 (refusal data persistent).

> **Postcondition:**
> - `GET /api/repertoire/refusals` response includes `hit_rate` field.
> - UI renders refusal list and hit-rate.
> - **Currently fails** — U2 is open.

---

### Stage 3.6 — Day 27 (after 200-day jump): large backlog handling

**What Johannes does:** `advanceDay(200)` is called. This simulates a long absence. The drill queue
has a large backlog.

**What he sees:** Drill queue returns at most `DUE_SOFT_CAP = 40` items (not the full backlog).

**Requirements:** `DUE_SOFT_CAP` enforcement in `src/domain/review/queue.js`, correct behaviour
under large backlog.

> **Postcondition:**
> - `GET /api/drill/due` returns ≤ 40 items.
> - The 200-day gap does not cause any error or data loss.

---

### Stage 3.7 — Days 28–29: tree view

**What Johannes does:** Opens the repertoire page. The tree panel shows his book in a navigable tree.

**Requirements:** U1 fix (tree view present).

> **Postcondition:**
> - DOM probe: `[data-testid="repertoire-tree"]` element exists on `/repertoire.html`.
> - **Currently fails** — U1 is open.

---

### Stage 3.8 — Day 30: mature state snapshot

**What Johannes does:** Plays a final `book_conforming_white` game.

**What he sees:** Full UI: tree, coverage %, refusal log, drill queue with opening cards.

**Requirements:** All FR-REP-* closed by Phase 35+.

> **Postcondition (invariants probe):**
> 1. No `rep_moves` row has `observations = 1` and `role = 'canonical'`.
> 2. No node has more than one `role = 'canonical'` move.
> 3. All `rep_changelog` rows carry non-null `provenance_id`.
> 4. `rep_observations` is append-only (no rows have been deleted).
> 5. `data/chess.db` mtime is unchanged from the start of the run.

---

## Appendix A — Journey stage summary

| Stage | Day | Games | Key assertion | Defects exposed |
|---|---|---|---|---|
| 1.1 | 1 | 1 | 4 candidates created | — |
| 1.2 | 2–3 | 2 | 4 nodes confirmed | FR-REP-LEARN-4 |
| 1.3 | 4–5 | 2 | 1 node quarantined | FR-REP-GATE-1 |
| 1.4 | 6–7 | 4 | Bootstrap threshold crossed | FR-REP-COACH-2 |
| 1.5 | 8 | 1 | `repertoire_update` event | **U5** |
| 1.6 | 9 | 1 | Single obs never canonical | invariant 6 |
| 2.1 | 10 | 1 | `ranked_changed` emitted | **B1** |
| 2.2 | 11 | 1 | `order_slip` kind | **B2** |
| 2.3 | 12 | 1 | `rep_challenges` opened | FR-REP-CHAL-1 |
| 2.4 | 13–14 | 2 | Rule 3 promotion | **B7** |
| 2.5 | 15 | 0 | Undo reversal | **U3** |
| 2.6 | 16 | 1 | Timeout → no challenge | FR-REP-COACH-8 |
| 2.7 | 17 | 1 | Coach-off game | FR-REP-COACH-13 |
| 2.8 | 18–19 | 2 | Strength-sample exclusion | **B9** |
| 2.9 | 20 | 1 | `repertoire_update` client | **U5** |
| 3.1 | 21 | 1 | Quarantine exit | **B5** |
| 3.2 | 22 | 0 | Candidate expiry | **B4** |
| 3.3 | 23–24 | 2 | Coverage % + gap report | **B8**, **U4** |
| 3.4 | 25 | 1 | Opening cards labelled | **U7** |
| 3.5 | 26 | 1 | Refusal hit-rate | **U2** |
| 3.6 | 27 | 0 | DUE_SOFT_CAP enforced | queue behaviour |
| 3.7 | 28–29 | 2 | Tree view present | **U1** |
| 3.8 | 30 | 1 | Full invariant sweep | all |
