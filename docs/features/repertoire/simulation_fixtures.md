# Simulation fixtures — auto-repertoire journey

**Status:** Phase 28 — 2026-08-30  
**Authority:** Non-normative. Describes the deterministic eval model used by `tests/support/journey/eval-model.js`.
This document is reviewable by a human without running anything. Any threshold change in `balance.js`
that invalidates a band assertion here is a breaking change requiring a `docs(balance):` commit.

---

## 1. The eval model

The journey harness never calls Stockfish or lc0. Instead, it uses a **programmatic eval model**: a
function that maps `(ply, game_type)` to a `move_evals` row. This produces deterministic,
human-readable fixtures that do not rot when Stockfish is updated.

### Band validation at load time

Every band declares the gate verdict it must produce. `eval-model.js` asserts this at module load:

```js
import { runGates } from '../../../src/domain/repertoire/gates.js';
import * as B from '../../../src/shared/balance.js';

// Assert each band at load time — a threshold change breaks this loudly
const BAND_ASSERTIONS = [
  { band: 'excellent',   winLoss: 3,  winAfter: 55, expectedVerdict: 'admitted' },
  { band: 'good',        winLoss: 7,  winAfter: 48, expectedVerdict: 'admitted' },
  { band: 'inaccuracy',  winLoss: 14, winAfter: 42, expectedVerdict: 'quarantined' },
  { band: 'mistake',     winLoss: 22, winAfter: 38, expectedVerdict: 'refused' },
  { band: 'blunder',     winLoss: 35, winAfter: 28, expectedVerdict: 'refused' },
];

for (const { band, winLoss, winAfter, expectedVerdict } of BAND_ASSERTIONS) {
  const verdict = runGates({ win_loss_pts: winLoss, win_after: winAfter, /* ... */ });
  if (verdict !== expectedVerdict)
    throw new Error(`Band '${band}' expected '${expectedVerdict}' but got '${verdict}'`);
}
```

If `balance.js` changes `REP_ADMIT_WIN_PTS` from 10 to 8, the `good` band assertion will fail
immediately — loudly, at import time, rather than silently reclassifying moves.

---

## 2. Band definitions

All values are from `src/shared/balance.js` (Phase 27 state). Gate thresholds (FR-REP-GATE-1/2):

| Gate | Threshold | Constant |
|---|---|---|
| Per-move admitted | `win_loss_pts < 10` | `REP_ADMIT_WIN_PTS = 10` |
| Per-move quarantined | `10 ≤ win_loss_pts < 20` | `REP_QUARANTINE_WIN_PTS = 20` |
| Per-move refused | `win_loss_pts ≥ 20` | — |
| Absolute floor (refused) | `win_after < 35` | `REP_MIN_ABS_WIN_PCT = 35` |

Sub-inaccuracy bands (FR-REP-GATE-1 admitted tier, classified only by centipawn loss):

| Band | CP range | Constant |
|---|---|---|
| Excellent | `cp_loss ≤ 25` | `GREAT_CP_MAX = 25` |
| Good | `25 < cp_loss ≤ 50` | `GOOD_CP_MAX = 50` |

### Full band table

| Band name | `win_loss_pts` | `win_after` | `cp_loss` | Gate verdict | Balance constants used |
|---|---|---|---|---|---|
| `excellent` | 3 | 55 | 10 | **admitted** | `REP_ADMIT_WIN_PTS`, `GREAT_CP_MAX` |
| `good` | 7 | 48 | 35 | **admitted** | `REP_ADMIT_WIN_PTS`, `GOOD_CP_MAX` |
| `inaccuracy` | 14 | 42 | 65 | **quarantined** | `REP_ADMIT_WIN_PTS`, `REP_QUARANTINE_WIN_PTS` |
| `mistake` | 22 | 38 | 120 | **refused** | `REP_QUARANTINE_WIN_PTS` |
| `blunder` | 35 | 28 | 250 | **refused** | `REP_MIN_ABS_WIN_PCT` (also fails absolute floor) |

**Reading the table:** `win_loss_pts = 14` is in `[10, 20)` so it is quarantined; `win_after = 42 ≥ 35`
so the absolute floor does not add a refusal on top. `blunder` with `win_after = 28 < 35` is refused
by gate 1 AND gate 2 independently.

---

## 3. Engine delta model (for challenge fixtures)

Challenge rules 2–5 require `engine_delta` (`winPct(challenger) − winPct(incumbent)`). The journey
harness injects this directly as part of the challenge fixture, not by running a real audit. The
injected value exercises the challenge rule logic without requiring `rep_audits` rows (those are
B6's fix in Phase 31).

| Fixture name | `engine_delta` | Expected rule |
|---|---|---|
| `challenge_rule2_clear` | +3.5 | Rule 2 (engine-clear, `≥ +2`) |
| `challenge_rule3_neutral` | −1 | Rule 3 (repeat + neutral, `≥ −3`) |
| `challenge_rule4_trend` | 0 | Rule 4 (trend/performance) |
| `challenge_rule6_incumbent` | −5 | Rule 6 (incumbent wins) |
| `challenge_rule7_abandoned` | null | Rule 7 (abandoned, no repetition) |

---

## 4. Scripted game types

Each game type has a fixed move sequence and per-ply eval band assignment. Sequences are expressed
in SAN from the starting position. Evaluations are applied from the player's (white's) perspective
unless stated.

### 4.1 `book_conforming_white`

**Purpose:** Build the book silently. All plies receive `excellent` eval.

| Ply | Move (SAN) | Side | Band | Notes |
|---|---|---|---|---|
| 1 | e4 | White | excellent | Own ply |
| 2 | e5 | Black | — | Engine ply (not recorded as own ply) |
| 3 | Nf3 | White | excellent | Own ply |
| 4 | Nc6 | Black | — | Engine ply |
| 5 | Bb5 | White | excellent | Own ply |
| 6 | a6 | Black | — | Engine ply |
| 7 | O-O | White | excellent | Own ply — reaches ply 4 (0-indexed), within REP_PLY_MAX=30 |

All 4 own plies pass gate 1 (`win_loss_pts = 3 < 10`). After 2 plays of this game, all 4 positions confirm.

### 4.2 `book_divergent_white`

**Purpose:** Introduce a quarantined move (Bd3 instead of Bb5).

| Ply | Move (SAN) | Side | Band | Notes |
|---|---|---|---|---|
| 1 | e4 | White | excellent | Same as conforming |
| 2 | e5 | Black | — | — |
| 3 | Nf3 | White | excellent | Same node as conforming |
| 4 | Nc6 | Black | — | — |
| 5 | Bd3 | White | inaccuracy | Own ply — diverges at ply 3 |

The Bd3 ply has `win_loss_pts = 14`. At second play it triggers gate 1 quarantine
(`10 ≤ 14 < 20`). `win_after = 42 ≥ 35` so gate 2 does not add a second refusal.

### 4.3 `book_refused_white`

**Purpose:** Trigger an alert on a move with `role = 'refused'` or `'retired'`.

| Ply | Move (SAN) | Side | Band | Notes |
|---|---|---|---|---|
| 1 | e4 | White | excellent | — |
| 2 | e5 | Black | — | — |
| 3 | Nf3 | White | excellent | — |
| 4 | Nc6 | Black | — | — |
| 5 | **d3** | White | mistake | Own ply — `role = 'refused'` from prior gate refusal |

The d3 ply was previously refused by gate 1 (`win_loss_pts = 22 ≥ 20`). Replaying it when the book
is bootstrapped triggers `repertoire_alert`. In the journey, the player's decision varies by stage:

- Stage 2.3: `decision = 'keep'` → challenge opened.
- Stage 2.1: `decision = 'correct'` → coach applies canonical Bb5.

### 4.4 `book_lapse_white`

**Purpose:** Alert on a `lapse` (plays known-bad move at a known node).

Same structure as `book_refused_white` but the refused move is a previously-seen move that now has
role `refused`. The `deviation.js` classifier should return `lapse` (or `refused_repeat` if the
player has refused this exact move before). Until B2 is fixed, the harness receives `lapse` for both.

### 4.5 `book_order_slip_white`

**Purpose:** Alert on `order_slip` (transposition alert).

| Ply | Move (SAN) | Side | Band | Notes |
|---|---|---|---|---|
| 1 | e4 | White | excellent | — |
| 2 | Nc6 | Black | — | Unusual response, still legal |
| 3 | Nf3 | White | excellent | — |
| 4 | e5 | Black | — | — |
| 5 | Bb5 | White | excellent | Same EPD as after 1.e4 e5 2.Nf3 Nc6 3.Bb5 |

The EPD after ply 5 is identical to the EPD reached by `book_conforming_white` ply 5. This is the
same `rep_nodes` row. The deviation classifier in `deviation.js` should classify this as `order_slip`
because the EPD is known and the player reached it via a transposition. Until B2 is fixed, the
harness receives `lapse`.

### 4.6 `book_quarantine_exit_white`

**Purpose:** Trigger a re-audit of the quarantined Bd3 node.

Same as `book_divergent_white` but with Bd3 ply receiving `excellent` eval (band override:
`win_loss_pts = 7`). On encounter, `reAuditQuarantined` checks the new eval and promotes to `alt`.
Until B5 is fixed, no re-audit fires.

### 4.7 `coach_off_game`

**Purpose:** Verify FR-REP-COACH-13 — no alert when `coach_enabled = 0`.

Identical move sequence to `book_refused_white` but the game is started with
`{ coachEnabled: false }`. No `repertoire_alert` must be emitted.

### 4.8 `book_extra_ply`

**Purpose:** Reach a ply-5 position not previously seen. Produces one new candidate.

| Ply | Move (SAN) | Side | Band |
|---|---|---|---|
| 1–4 | Same as `book_conforming_white` | — | excellent |
| 5 | Nc3 | White | excellent | New position — first observation at ply 5 node |

---

## 5. Move_evals row format

Each ply in a scripted game produces one `move_evals` row. The harness constructs these rows using
`evalModel.rowForPly(gameId, ply, fen, moveSan, moveUci, band)`:

```js
{
  game_id:        gameId,
  ply:            ply,           // 1-indexed
  fen:            fen,           // FEN after the move
  move_uci:       moveUci,
  move_san:       moveSan,
  cp_white:       cp_white,      // derived from band.cp_loss, perspective = white
  mate_in:        null,
  best_move_uci:  bestmove,      // from FakeEnginePool (first legal move)
  pv:             null,
  mover:         'player',       // or 'engine' for non-own plies
  win_before:     win_before,    // 50 for starting position approx
  win_after:      band.win_after,
  cp_loss:        band.cp_loss,
  win_loss_pts:   band.win_loss_pts,
  classification: band.classification,   // 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'
  move_accuracy:  null,
  alt_moves_json: null,
}
```

These rows are written via `gameRepo.saveMoveEval(row)` after the game ends (mirroring
`analyseGame`'s loop). They are the **only** source of truth for the gates.

---

## 6. Challenge evidence injection

Rules 2–5 require `engine_delta_win_pts` to be present in `rep_challenges`. Until Phase 31 fixes B7,
this column is never written in production. The journey harness tests rule 3 by injecting the column
value directly into `rep_challenges` after the challenge is opened (via a write-proxy-allowed
"evidence injection" hook), allowing Phase 28's rule-3 stage to fail loudly on the B7 condition
and pass once Phase 31 lands. This is the only allowed direct database write outside the handler.

---

## 7. Fixture versioning

Every fixture set carries a version string (`FIXTURE_VERSION = 'v1'`). If the game sequences or
eval bands change, the version must increment. The harness asserts that the fixture version matches
what the journey file declares. This prevents silent fixture drift.
