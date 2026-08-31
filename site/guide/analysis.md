---
title: Post-game Analysis
---

# Post-game Analysis

The review page shows a full annotated record of a game: the win-percentage graph, per-move classifications, accuracy scores, strength estimates, and the list of drillable mistakes.

**How to reach it:**
- Click **Review** on the play page after a game finishes
- Click any game row in the **Games** list

---

## The win-percentage graph

The graph plots White's winning probability (0–100%) across every ply in the game. The x-axis is move number; the y-axis is win probability.

A flat line means the advantage stayed the same. A sharp drop on your turn is a mistake. A sharp drop on the engine's turn is an inaccuracy by the opponent.

The win percentage is derived from the Stockfish centipawn evaluation using the lichess formula: a sigmoid that maps centipawns to a probability in [0, 1]. Forced mates map to approximately 99.7%.

---

## Move classifications

Each move in the move list is coloured by its classification, determined by win-percentage loss.

| Glyph | Label | Threshold | Colour |
|---|---|---|---|
| `??` | Blunder | >= 30 win% lost | `#dd7065` |
| `?` | Mistake | >= 20 win% lost | `#b85a50` |
| `?!` | Inaccuracy | >= 10 win% lost | `#8f4a45` |
| — | OK | < 10 win% lost, cp loss >= 50 | `#6f6f69` |
| — | Good | < 10 win% lost, cp loss < 50 | `#256abf` |
| `!` | Great | cp loss < 25 | `#3987e5` |
| `!!` | Best | Engine's top choice | `#6da7ec` |

The primary classification uses win-percentage loss, not centipawns. Win-percentage loss is position-invariant: a 30-point loss in a balanced middlegame is comparable to a 30-point loss in an endgame, even when the centipawn swings differ. Centipawns are used only for the sub-inaccuracy tiers (OK / Good / Great / Best).

---

## Accuracy

The accuracy score is a per-player value from 1 to 100.

- **100** means every move maintained or improved the position relative to the best available move
- Lower scores reflect the frequency and severity of inaccuracies
- The formula blends a harmonic mean (rewards consistency; a single blunder lowers the score significantly) with a volatility-weighted mean (rewards finding strong moves in sharp positions)

Accuracy is computed for both players. The opponent's accuracy appears on the review page under **Opponent accuracy**.

---

## Strength estimation

Two strength tiles appear per player:

**This game** — an Elo estimate based on scaled centipawn error for this game alone. The +/-SE value is the standard error.

A single game has an irreducible noise floor of roughly +/-250–300 Elo. This is not a software limitation — it reflects the inherent variance of chess performance.

**Rolling estimate** — the inverse-variance weighted aggregate over the last 10 eligible games. The rolling SE narrows as more games are included. This is the more meaningful figure.

The strength estimate excludes positions with only one legal move, positions with forced-mate evaluations, and positions where the engine considers the game already decided (centipawn advantage above the decided threshold).

---

## The mistake list

Below the graph, the review page lists all mistakes from the game. Each entry shows:

| Field | Description |
|---|---|
| Classification | Blunder, mistake, or inaccuracy |
| Move played | The move played, in SAN notation |
| Best move | The engine's top choice for that position |
| Win% loss | Win-percentage points lost |
| Findability | Maia's probability of finding the best move (0–1) |
| Alternatives | Other moves within 3 win% of best |
| Tags | `common_trap`, `was_timed`, `engine_only` |

### Findability

Findability is the probability that Maia would find the best move in the position.

- **>= 0.04**: the mistake becomes a drill card
- **< 0.04**: tagged `engine_only` — shown in the review but not added to the drill queue

A findability of 0.8 means Maia finds this move 80% of the time. The 0.04 gate removes moves that require engine-level calculation to find — drilling them would not be productive.

### Tags

| Tag | Meaning |
|---|---|
| `engine_only` | Findability below 0.04; shown in review, not drilled |
| `common_trap` | The played move is highly tempting (high Maia probability on the played move) |
| `was_timed` | The game was played with time controls active at the moment of this mistake |

---

## Opponent analysis

The review page shows the opponent's accuracy and strength estimate alongside yours. The opponent's mistakes are shown for context; they do not enter your drill queue.
