---
title: Stats
---

# Stats

The Stats page (`/stats.html`) shows all aggregate lifetime metrics in one place. It is separate from the dashboard, which shows only the most time-sensitive figures.

---

## Stat tiles

Each tile is shown only when sufficient data exists — tiles are hidden on a fresh install.

| Tile | What it shows |
|---|---|
| **Rating** | Current win/loss Elo, delta vs previous game, Elo history chart |
| **Streak** | Current day-streak and longest-ever streak |
| **Drill accuracy** | All-time first-attempt accuracy %, 7-day trend arrow, per-day sparkline (30 days) |
| **Win rate** | All-time win %, 14-day trend arrow, per-day sparkline (90 days) |
| **Accuracy trend** | Avg accuracy of last 10 games, 7-vs-14-day trend arrow, per-game sparkline |
| **Style match** | Rolling Maia style-match % — how closely your moves match human moves (last 10 games) |
| **Strength Elo** | Rolling move-quality Elo ± SE (last 10 eligible games), per-game sparkline |
| **Mistakes retired** | Cards that have graduated from the drill queue |
| **Results** | Lifetime wins / losses / draws |
| **Queue health** | Due cards as a fraction of the soft cap (40) |

---

## Trend arrows

Tiles with trend arrows compare two recent windows:

- **Drill accuracy** — last 7 days vs the 7 days before that
- **Win rate** — last 14 days vs the 14 days before that
- **Accuracy trend** — last 7 games vs the 7 games before that

↑ means the recent window is more than 1 point above the prior window. ↓ means more than 1 point below. → means roughly stable.

---

## Rating vs Strength Elo

Two separate Elo estimates appear on the stats page:

**Rating** (win/loss Elo) — updated after every ranked finished game using K-factors and the standard Elo formula. It reflects game outcomes, not move quality.

**Strength Elo** (move-quality Elo) — derived from scaled centipawn error using the Regan-Haworth method, calibrated against Maia-1600. It reflects how accurately you play regardless of whether you win or lose. A single game has an irreducible noise floor of ±250–300 Elo; the rolling estimate over 10 games is the meaningful figure.

The two numbers can diverge: a player who loses close games because of time pressure may have a higher Strength Elo than their win/loss rating suggests.

---

## Motif weakness tile

The **Your weaknesses** card shows all motif tags across your puzzles as horizontal bars, longest first. Each bar shows:

- Tag name and count
- Drill accuracy % for that motif (if any first-attempt reviews exist)
- **drill →** link to open a filtered drill session for that pattern

The **Top weakness** line identifies the most frequent error pattern and links directly to drill it.

The **Focus recommendation** card (shown when sufficient data exists) suggests the single motif with the highest expected improvement per drill minute — based on frequency and current accuracy.

---

## Time range filtering

The Elo chart and the quality mix table support 30-day, 90-day, and all-time views via the button group at the top right of each card. The sparkline tiles always show their full configured window.

---

## Quality mix

The quality mix table breaks down every player move by tier (Blunder → Best). It is a lifetime aggregate — it shows the distribution of your move quality across all analysed games.
