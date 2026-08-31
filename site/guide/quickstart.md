---
title: Quickstart
---

# Quickstart

This walkthrough covers the complete pawnbook loop from first start to first drill session.

---

## Step 1 — Start the server

```bash
docker compose up
```

Or for a native install:

```bash
npm start
```

Open `http://localhost:3000`. The dashboard appears.

<!-- screenshot: dashboard on first load, Elo=1200, dueCount=0, no games -->

---

## Step 2 — The dashboard

On a fresh install the dashboard shows:

- **Elo tile**: 1200 — the starting rating before any ranked games
- **Puzzles due tile**: 0 — no games played yet, no drill cards
- **Streak tile**: 0 days
- **Suggested opponent**: appears once the engine availability check completes (a few seconds after startup)
- **Recent games**: empty table

The suggested opponent is chosen based on your current Elo. On first launch it defaults to Maia-1500.

---

## Step 3 — Pick an opponent and start a game

Click **Play** in the navigation. The play page shows the board and an opponent selector.

Choose an opponent from the grid:

- **Maia-1500** is a reasonable starting point for most casual players. It plays like a 1500-rated human — it will blunder, miss tactics, and play somewhat inaccurately, producing a realistic game.
- **Stockfish at calibrated depth** plays more precisely at the same rating but with different error patterns. Use it if you want cleaner, more consistent opposition.

Leave the defaults as-is for your first game: White, Ranked, no time control, Coach on.

<!-- screenshot: opponent selector grid with Maia models highlighted -->

:::info Coach toggle
The coach is silent until you have 20 confirmed opening book nodes. For a first game it will not intervene even if coach is enabled.
:::

---

## Step 4 — Play a game

Click the pieces to move. The engine responds after a short pause.

After the game ends:

1. A result card appears on the board — win, loss, or draw. Elo shows `—` while analysis runs.
2. An analysis progress bar fills in three segments. Pass 1 (the largest segment) evaluates every position; pass 2 re-examines mistakes; pass 3 runs Maia policy probes.
3. When analysis finishes, `game_over` is re-sent with the final Elo delta. The Elo tile on the board updates.

The full analysis of a 40-move game takes under 5 minutes on modern hardware if no pre-evaluation was cached. Subsequent games are faster because positions are pre-evaluated during play.

<!-- screenshot: post-game result card with analysis progress bar -->

---

## Step 5 — Review and drill

Two buttons appear after the game:

**Review** — opens the annotated game. You will see:
- A win-percentage chart across the game
- Each move colour-coded by classification (blunder, mistake, inaccuracy, good, great, best)
- A mistake list with findability scores and best-move alternatives

**Quiz** — opens immediate practice on the mistakes from this game. The quiz does not schedule FSRS cards; it creates cards that enter the normal drill queue from tomorrow.

To drill your queue: click **Drill** in the navigation. Due cards appear one at a time. Find the best move in each position. The server infers a rating from your response time and correctness — you do not rate yourself.

<!-- screenshot: drill screen with puzzle position -->

---

## That's the loop

Every game feeds the analyser. Every mistake feeds the queue. The queue gets shorter as you drill.

The dashboard Elo and strength-estimate tiles update after each analysed game. The due-count tile tracks how many cards are waiting. The streak tile marks days with any activity.

Continue from here:

- [Playing Games](./playing) — game options, coach alerts, clock controls
- [Post-game Analysis](./analysis) — reading the review page in detail
- [The Drill System](./drilling) — how FSRS scheduling works
- [The Repertoire Coach](./repertoire) — how the opening book builds over time
