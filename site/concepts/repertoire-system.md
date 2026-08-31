---
title: Repertoire System
---

# Repertoire System

pawnbook builds a personal opening repertoire from your own games — no imports, no manual curation. The book learns which moves you play, evaluates them for soundness, and coaches you when you deviate. This page explains the underlying system.

## EPD keying

Every position in the book is identified by its EPD key: the first four fields of the FEN string (piece placement, side to move, castling rights, en passant square). This makes the book **transposition-safe** — reaching the same position via two different move orders is one node in the book, not two.

## Move roles

Each move at each position is tracked in a `rep_moves` row with one of seven roles:

```
candidate ──(≥2 obs, gate-pass)──► canonical
          ──(≥2 obs, alt-vote)──► alt
          ──(≥2 obs, gate-fail)──► refused
          ──(≥2 obs, quarantine)──► quarantined
          ──(obsolete)──────────► retired

canonical/alt ──(you deviate)──► challenger
```

| Role | Meaning |
|---|---|
| `candidate` | Seen fewer than `REP_CONFIRM_OBS` (2) times — not yet admitted |
| `canonical` | Confirmed best known move for this position |
| `alt` | Acceptable alternative; you and the book both accept it |
| `challenger` | Your preferred move conflicts with canonical — an open challenge |
| `quarantined` | Passes observation count but per-move cost is in [10, 20) win% |
| `refused` | Failed a soundness gate — not an acceptable book move |
| `retired` | Previously active, no longer |

## Observations and confirmation

Every own opening move is recorded as an observation with a source tag:

| Source | Description |
|---|---|
| `game` | You played this move naturally |
| `coach_kept` | You kept your move after the coach alerted you |
| `coach_corrected` | You played the book move after the coach alerted you |

`coach_corrected` observations are **not counted** toward the confirmation threshold. This prevents the book from confirming moves the coach steered you toward — the book should reflect your actual preferences, not coach compliance.

Confirmation threshold: `REP_CONFIRM_OBS = 2`. Once a candidate has 2 qualifying observations, the **recency-weighted vote algorithm** selects the canonical move among confirmed candidates. The vote uses a half-life of 120 days — more recent plays weigh more.

## Soundness gates

Before a move can be admitted to the book, it passes through four gates (`src/domain/repertoire/gates.js`). Failure at any gate refuses the move:

1. **Forced mate**: the position has a forced mate for the opponent → refused
2. **Per-move cost**: win% loss ≥ 20 points for this move → refused (unsound)
3. **Absolute floor**: win% after the move < 35%, when best available reaches ≥ 35% → refused
4. **Line budget**: cumulative win% loss along your entire opening line ≥ 20 points → refused

Moves with per-move cost in [10, 20) win% are **quarantined** — tracked but not promoted to canonical until the cost improves.

## The coach

During play, the coach intercepts your move before it is applied to the game and checks it against the book.

Guards that silence the coach:
- Fewer than `REP_BOOTSTRAP_CONFIRMED_MIN` (20) confirmed canonical nodes — not enough book data
- Beyond ply `REP_PLY_MAX` (30) — the book does not extend this deep
- More than `REP_ALERTS_PER_GAME_MAX` (3) alerts already fired this game
- `coachEnabled = false` set at game start

**Alert kinds** (when the coach speaks):

| Kind | Meaning |
|---|---|
| `order_slip` | You played the right move but out of order |
| `lapse` | You deviated from a position you know well |
| `refused_repeat` | You repeated a move the book has already refused |
| `novelty` | You played a move the book has never seen |

When an alert fires:
1. The game is immediately de-ranked (`ranked = false`)
2. A `repertoire_alert` WebSocket message is sent
3. You have 60 seconds to choose `correct` (play the book move) or `keep` (play your move)
4. If you do not respond within 60 seconds, your original move is applied automatically and no challenge is opened

The 60-second window does not consume clock time — the pre-alert thinking time is captured and restored.

## Challenges

When you choose `keep` after an alert, a **challenge** is opened. A challenge asks: is your preferred move actually better than the book's canonical move?

Challenges are resolved by the **challenge-service** after analysis completes, using 9 rules evaluated in first-match order:

| Rule | Outcome |
|---|---|
| 1. Gate veto | `rejected_unsound` |
| 2. Engine-clear (challenger wins by ≥ 2 win%) | `promoted` |
| 3. Repeat plays + engine neutral | `promoted` |
| 4. Trend or result evidence within tolerance | `promoted` |
| 5. Style-call (gates pass + results support you) | `promoted` |
| 6. Incumbent wins (replayed ≥ 3× or trend/result favour it) | `rejected` |
| 7. TTL (8 encounters without resolution) | `abandoned` |
| 8. Both moves qualify (≥ 3 recent plays each) | `settled_both` (alternation) |
| 9. — | Still open |

Rule 5 (style-call) is intentional: the book accepts your stylistic preferences even when the engine prefers the incumbent, as long as the challenger passes the soundness gates and your results support it.

## The audit service

Before challenge resolution, the **audit service** (`src/api/ws/audit-service.js`) gathers objective evidence:

- Depth-22 MultiPV-3 Stockfish A/B evaluation of challenger and incumbent positions
- `engine_delta_win_pts` = challenger win% − incumbent win%
- Gate verdict on the challenger
- Trend evaluation at +2, +4, +6 plies from your observation games
- Elo-adjusted result performance

## Reach probability

The **reach service** (`src/api/ws/reach-service.js`) estimates the probability that a real game will reach each book node. It performs a breadth-first search from the starting position using Maia policy weights at the Elo levels of your actual opponents.

This works accurately because pawnbook's opponents **are** Maia at known Elo levels — the reach probability is not an approximation from crowd statistics, it is the literal probability the opponent model generates.

Reach probability powers:
- **Coverage %**: fraction of reachable positions that have a canonical move (weighted by reach)
- **Gap report**: positions with high reach but no book coverage, ranked
- **Opening card sort**: FSRS cards for highly-reachable positions are drilled first

## Changelog and reversal

Every book change (promote, retire, refuse, settle, elect, quarantine-exit) is written as a `rep_changelog` entry. The changelog:

- Drives the **Journey** view: timeline, growth series, milestones
- Enables the **Reverse** button: a `promote` or `settle` entry can be undone, restoring the incumbent to canonical and suppressing the challenger for `REP_REVERSAL_SUPPRESS_ENCOUNTERS` future encounters

## Data model

The repertoire data model is append-only by design. The source-of-truth tables are never updated in place:

| Table | Content |
|---|---|
| `rep_observations` | One row per own opening ply |
| `rep_deviations` | Per-game deviation log |
| `rep_challenges` | Challenge records (never deleted) |
| `rep_changelog` | Book change feed |
| `rep_suppressions` | Reversal memory |
| `rep_provenance` | Schema version, balance hash, git SHA, engine versions |

`rep_nodes` and `rep_moves` are derived projections that can be rebuilt from the append-only tables. This means the entire book history is preserved and auditable.
