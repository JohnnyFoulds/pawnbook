---
title: Strength Estimation
---

# Strength Estimation

pawnbook estimates your playing strength from move quality rather than game outcomes. This gives a signal every game, independent of whether you won or lost, and independent of the opponent's rating.

## The problem with outcome-based Elo

Standard Elo accumulates slowly and noisily. At K=20, a single game moves your rating by at most 20 points. Luck, opponent selection, and time pressure all add variance that takes dozens of games to average out. Worse, outcome-based Elo is confounded with opponent choice: switching to weaker opponents makes your Elo look lower even if you played better chess.

Move quality is a more direct signal. If you played better moves, your strength estimate goes up — regardless of result.

## Approach: Regan-Haworth scaled error

The method is adapted from Regan & Haworth (2011), who developed intrinsic chess ratings using engine evaluation as a ground truth.

For each eligible move in a game, compute the **scaled error**:

```
scaled_error = ln(1 + min(cpLoss, 300) / 100)
```

Where `cpLoss` is the centipawn loss for the move played (engine's best move minus move played, in centipawns). The `ln(1 + x)` transformation compresses large errors — a 300 cp blunder is not 10× worse than a 30 cp inaccuracy for strength estimation purposes. The cap at 300 cp prevents a single catastrophic move from dominating the estimate.

The **mean scaled error** (ASE) over all eligible plies in a game is then converted to an Elo estimate:

```
strength_elo = anchor_elo - (ase - anchor_ase) × elo_per_ase_unit
```

### Calibration

The model is anchored to Maia-1600 performance:

| Parameter | Value | Meaning |
|---|---|---|
| `anchor_elo` | 1600 | Maia-1600's nominal Elo |
| `anchor_ase` | 0.2638 | Maia-1600's measured ASE |
| `elo_per_ase_unit` | 6500 | Slope: how much Elo changes per unit of ASE |

Coefficients are stored in `calibration/strength-model.json` and versioned. The `scripts/refit-strength.js` script runs a weighted least-squares regression to update coefficients when ≥ 20 calibration samples are available.

## Eligible plies

Not all moves are informative for strength estimation. A ply is **excluded** from the sample if:

- **Forced move**: only one legal move exists — playing the only legal move tells you nothing about strength
- **Mate evaluation**: the engine sees a forced mate; centipawn loss is undefined or dominated by tactical trees, not strategic quality
- **Decided position**: `|cp_white| > 600` — in a position where one side is already winning by 6 pawns, optimal play is trivially correct and deviations are noisy

The remaining plies are eligible. Each game must have at least 12 eligible plies before a strength sample is computed.

## Per-game output

For each game, pawnbook computes and stores:

| Field | Description |
|---|---|
| `strength_elo` | Point estimate (integer) |
| `strength_se` | Standard error (integer) |
| `n` | Number of eligible plies |
| `ase` | Mean scaled error |
| `sd` | Standard deviation of per-ply errors |
| `p75_loss` | 75th percentile centipawn loss |

The `se` field is derived from the standard deviation and sample size. It quantifies how much to trust the single-game estimate.

## Rolling aggregate

The per-game estimate is noisy (see [honest limitations below](#honest-limitations)). pawnbook maintains a **rolling aggregate** over the last 10 eligible games using inverse-variance weighting:

```
rolling_elo = Σ(strength_elo_i / se_i²) / Σ(1 / se_i²)
```

Games with higher `se` (fewer eligible plies, or high within-game variance) contribute less to the aggregate. The rolling estimate is displayed alongside the per-game estimate on the review page.

## Why not move-matching?

A negative result informed this design choice. In a test, deliberately playing badly (random legal moves) produced a *higher* move-matching score against Maia-1600 than carefully played chess. The root cause: Maia's policy is non-monotone at low strengths — a very weak player occasionally plays moves that Maia-1600 also plays, by coincidence, and Maia's policy mass concentrates on a few legal moves in any given position.

Quantitatively: scaled error carries approximately 3.2× the relative signal of move-matching (measured by R² against known-Elo games). Move-matching is not used.

## Honest limitations {#honest-limitations}

**Single-game noise is irreducible.** A standard chess game contains 30–40 eligible plies. Each ply contributes an independent error sample with high variance. The resulting one-game standard error is approximately ±250–300 Elo. No amount of algorithmic sophistication removes this — it is an information-theoretic limit. This was confirmed independently by the Kaggle *Finding Elo* competition (2013), where the world-class winning entry achieved a mean absolute error of ~156 Elo per game.

**Calibration is narrow.** The anchor is a single Maia model (Maia-1600) under specific engine conditions. The calibration is not validated against a wide range of human Elo levels. The slope (6500 Elo/ASE) is derived from a small initial sample and should be treated as approximate until more calibration data accumulates.

**Engine depth matters.** pawnbook uses Stockfish at depth 20 (incremental pre-eval) and depth 18 (pass-1 retrospective). Deeper analysis would shift some move classifications at the margin. The calibration was performed at the same depth, so relative comparisons within pawnbook are valid, but absolute Elo numbers should not be compared to estimates from other tools using different engine configurations.

## Reference

Regan, K. W., & Haworth, G. McC. (2011). Intrinsic Chess Ratings. *Proceedings of the 25th AAAI Conference on Artificial Intelligence*, 834–839.
