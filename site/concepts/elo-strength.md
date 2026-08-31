---
title: Elo & Strength Estimation
---

# Elo & Strength Estimation

pawnbook tracks two separate rating numbers: an **Elo** derived from game outcomes, and a **playing-strength Elo** derived from move quality. They measure different things and are displayed separately.

## Game Elo

Game Elo works like standard chess Elo: win against a higher-rated opponent, gain more points; lose to a lower-rated opponent, lose more points. The formula uses the standard expected-score calculation with a ±400 centipawn difference clamp (FIDE convention).

**K-factors** (how many points each game is worth):

| Phase | K | Condition |
|---|---|---|
| Provisional | 40 | First 15 games |
| Mid-range | 20 | Elo < 2100 |
| Established | 10 | Elo ≥ 2100 |

**Floor**: Elo cannot go below 100.

**When Elo is NOT updated**:
- The game was marked unranked (player toggle or drawfish opponent)
- The coach fired an alert during the game — any game with a coach intervention is immediately de-ranked
- Analysis did not complete successfully

The Elo update is applied after analysis finishes and is delivered in the second `game_over` WebSocket message. The first `game_over` (at game end) has null Elo values.

## Playing-strength Elo

Playing-strength Elo is computed independently of game outcomes. You can lose a game while showing strong play; you can win while playing weakly. The strength estimate reflects the quality of your moves, not the result.

### Method: Regan-Haworth scaled error

For each eligible ply, pawnbook computes:

```
scaled_error = ln(1 + min(cpLoss, 300) / 100)
```

The mean scaled error (ASE) over eligible plies is then converted to an Elo estimate via a linear calibration.

This formula is from Regan & Haworth (2011), adapted for the engine and time controls available here.

### Eligible plies

Not every position is informative about skill. The following are excluded from the sample:

- **Forced moves**: only one legal move — no choice was made
- **Mate evaluations**: the position is already decided
- **Decided positions**: `|cp_white| > 600` — too far gone to distinguish skill levels

### Calibration

The conversion from ASE to Elo is a linear function derived from WLS regression:

- Anchor: Maia-1600 ASE ≈ 0.2638
- Slope: approximately 6500 Elo per ASE unit

The coefficients are versioned in `calibration/strength-model.json`. To update them with new data, run `scripts/refit-strength.js` (requires ≥ 20 samples spanning ≥ 3 distinct Elo levels).

### Reported values

For each game with enough eligible plies:
- Elo estimate (integer)
- Standard error (integer) — the ±band around the estimate
- Sample size (n eligible plies)
- ASE and its standard deviation

### Single-game noise

One game gives a rough ±250–300 Elo band. This is an irreducible property of the measurement method — not a software limitation. The Kaggle "Finding Elo" competition (world-class effort on a much larger dataset) left a residual standard deviation of ~195 Elo per game. pawnbook's band is honest about this.

### Rolling aggregate

To narrow the band, pawnbook computes an inverse-variance weighted mean over the last 10 eligible games. The rolling aggregate is displayed alongside the single-game estimate. More games → narrower band.

The rolling estimate is what "your strength" means in pawnbook's stats and on the dashboard. The single-game estimates feed into it and are also visible in the per-game review.
