---
title: Playing Games
---

# Playing Games

The play page is the main entry point for a game. It contains the board, the opponent selector, and game option controls.

---

## Opponent selection

The opponent grid shows all available opponents. Opponents whose engine binary or weight files are not found on disk are greyed out.

**Maia opponents** (prefix `maia-`) play like humans at the specified Elo level. They were trained on real human games and make human-shaped mistakes: hanging pieces, missing tactics, playing passively. A Maia-1300 opponent will not spot a 4-move combination; a Maia-1800 will not hang a piece to a one-move tactic.

**Stockfish opponents** (prefix `sf-`) use reduced search depth calibrated to specific Elo levels. Their tactical calculation is more precise than Maia at the same rating — they do not blunder pieces — but they see less deeply than full-strength Stockfish.

**Maia-3 opponents** use the newer Chessformer architecture with a continuous Elo input. They are similar to Maia but trained on a wider dataset with finer Elo resolution.

**drawfish** (if installed) plays for stalemate rather than material advantage. Games against drawfish are always unranked.

---

## Game options

### Color
White, Black, or Random. When Random is selected, the server assigns the color.

### Ranked
On by default. When ranked:
- A win, loss, or draw updates your Elo after analysis completes
- The game is included in strength estimation

Coach interventions (see below) force the game to unranked. The **Ranked** toggle switches to off and is locked for the remainder of that game.

### Time controls

Optional Fischer increment. Leave blank for untimed (the training default).

```
initialSec: starting clock per side (e.g. 300 = 5 minutes)
incSec:     increment added after each move (e.g. 3 = 3-second increment)
```

The **server is authoritative** for the clock. The client display is updated from server timestamps; it may lag by up to one second. On timeout (flag-fall), the server ends the game with result `1-0` or `0-1`.

### Coach

On by default once 20 or more confirmed canonical book nodes exist. Before that threshold the coach is silent regardless of this toggle.

Toggle per game to disable. When coach is off, no alerts fire and the game is eligible for Elo update as usual.

---

## During the game

### Hints

Available in unranked games only. Clicking **Hint** shows a highlight on the piece that should move. The hint does not show the destination square.

Rate-limited to 1 hint per 2 seconds. Using a hint in a puzzle is recorded — it downgrades the FSRS rating to **Again** on that card.

### Resign

Ends the game immediately. The result is recorded as a loss (0-1 if you played White, 1-0 if Black). Analysis runs on resigned games.

### Move input

Click a piece to select it; click a destination square to move. Promotion pieces are selectable when a pawn reaches the back rank.

---

## The coach alert

When the coach is active and you play an alertable deviation from your opening book, an alert panel appears.

**Alert kinds:**

| Kind | Meaning |
|---|---|
| `order_slip` | A known book move played in the wrong position in the sequence |
| `lapse` | A refused (unsound) move you have played before |
| `refused_repeat` | The move has been evaluated as unsound |
| `novelty` | A move not in your book, in a position your book covers |

**What happens during an alert:**

1. The game becomes unranked immediately. The **Ranked** indicator switches to off.
2. The alert panel shows the book move and your move, with the cost in win-percentage points.
3. You have **60 seconds** to decide.

**Your choices:**

- **Correct** — the board plays the book move instead. Your move is discarded. The game continues.
- **Keep** — your move is accepted and a challenge is opened for later review by the engine.
- **Timeout** — if you do not respond within 60 seconds, your original move is applied automatically. No challenge is opened.

A maximum of **3 alerts** fire per game. After the third, the coach is silent for the remainder of that game.

:::tip Clock note
The 60-second decision window is not counted against your clock. The time you spend reading the alert is returned to you when the game resumes.
:::

---

## After the game

When the game ends (checkmate, stalemate, resignation, flag-fall, repetition, or insufficient material), the result card appears.

**Elo shows `—`** until analysis completes. The analysis runs in the background; three progress segments fill:

1. **Pass 1** — Stockfish evaluates every position (largest segment)
2. **Pass 2** — MultiPV re-analysis of candidate mistakes
3. **Pass 3** — Maia policy probes for findability

When analysis finishes, `game_over` is re-sent with the final Elo delta. The Elo tile updates. Puzzle cards enter the drill queue.

**Buttons after the game:**

| Button | Action |
|---|---|
| Review | Opens the annotated game review |
| Quiz | Opens immediate drill practice for this game's mistakes |
| Play Again | Returns to the opponent selector with the same settings |

---

## Resuming a game

If the server restarts mid-game, open the play page. The in-progress game is detected and a **Resume** button appears on the dashboard. The server replays all moves from the database to restore the game state. The clock is not restored for timed games — the game resumes as untimed.
