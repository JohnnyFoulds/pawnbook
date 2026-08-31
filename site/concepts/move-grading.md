---
title: Move Grading
---

# Move Grading

Every move in every game is graded by comparing the position's win probability before and after the move. This produces a classification and an accuracy score. Both are displayed in the post-game review.

## Win probability

The foundation of all grading is win probability, not raw centipawns. Centipawns from the engine are converted to win probability using the lichess formula — an S-curve clamped at ±1000 cp (at those extremes, win probability is effectively 100% or 0%). Mate evaluations are treated as ±1000 cp.

Win% is position-invariant in a way raw centipawns are not: a 200 cp advantage in a closed endgame is more decisive than 200 cp in a sharp tactical position. Win% captures that distinction.

## POV normalisation {#win-pov-normalisation}

All evaluations are stored from White's perspective. When it is Black's turn to move, the engine's centipawn score (which is side-to-move-relative) is negated before storage.

This normalisation is applied in both `UciEngineClient` (production) and `ScriptedEngineClient` (tests), and covers every MultiPV line, not only the top line. The shared utility is `src/shared/pov.js`.

## Classification

Move quality is determined in two stages:

**Stage 1** — win% loss thresholds (applied first):

| Classification | Threshold |
|---|---|
| Blunder `??` | win% loss ≥ 30 points |
| Mistake `?` | win% loss ≥ 20 points |
| Inaccuracy `?!` | win% loss ≥ 10 points |

**Stage 2** — centipawn loss tiers (for moves that pass stage 1):

| Classification | Threshold |
|---|---|
| OK | cp loss ≥ 50 |
| Good | cp loss < 50 |
| Great `!` | cp loss < 25 |
| Best `!!` | engine's top choice |

The colour palette used in the UI (from `src/shared/quality.js`):

| Tier | Colour |
|---|---|
| Blunder | `#dd7065` |
| Mistake | `#b85a50` |
| Inaccuracy | `#8f4a45` |
| OK | `#6f6f69` |
| Good | `#256abf` |
| Great | `#3987e5` |
| Best | `#6da7ec` |

The thresholds are defined in `src/shared/balance.js`: `BLUNDER_WIN_PTS = 30`, `MISTAKE_WIN_PTS = 20`, `INACCURACY_WIN_PTS = 10`, `GREAT_CP_MAX = 25`, `GOOD_CP_MAX = 50`.

## Accuracy

**Per-move accuracy**: returns 100 when `winAfter ≥ winBefore` — good moves are not penalised for playing in an already-winning position. Below that threshold, the score follows a smooth 0–100 curve based on the magnitude of the win% loss.

**Game accuracy**: blends two means:
- Harmonic mean — rewards consistency (penalises the worst moves heavily)
- Volatility-weighted mean — weights critical positions more heavily

The final score is 1–100 and displayed as a tile on the review page.

## Phase detection

Every ply is tagged with a game phase:

| Phase | Condition |
|---|---|
| Opening | ply ≤ 20 AND castling rights still present for either side |
| Endgame | no queens on the board AND ply ≥ 28 |
| Middlegame | everything else |

Phase is used to break down mistakes in the stats page (opening/middlegame/endgame breakdown bars).

## Findability

Findability measures how discoverable the correct move is to a human player. It is computed in pass 3 of the analysis pipeline using Maia policy weights.

`findability = P_maia(Stockfish best move)`

The Maia model used for the probe is calibrated to play like the player's recent opponents. A move with `findability = 0.8` is one that 80% of Maia players would find; `findability = 0.02` is a computer move that essentially no human considers.

**Puzzle gate**: `findability ≥ 0.04` → drillable puzzle. Below this threshold, the puzzle is tagged `engine_only` — visible in the review page's mistake list, but not added to the drill queue. There is no value in practising a move that cannot be learned through repetition.

**Instructiveness**: `instructiveness = win_loss_pts × findability`. A blunder that was findable (high instructiveness) is worth more practice time than a blunder on an obscure engine move (low instructiveness). Instructiveness is the primary sort key for the drill queue.

**Temptation**: `temptation = P_maia(played move)`. When temptation is high, the puzzle is tagged `common_trap` — many players would make the same mistake. This tag is visible in the review and quiz views.
