# Research record — playing-strength estimation

This document is the permanent record of the research behind Phase 14's strength estimator.
It is the *why* behind every coefficient in `docs/game/balance.md § Playing strength`.

Phase 15 asset research (Maia-3, Maia-2, rated-Elo opening book) will be added to
`docs/research/skill-models.md` and `docs/research/opening-elo-book.md`; this file
cross-links to them rather than duplicating that material.

---

## §1.1 Closed question: there is no maia-2400

Checked directly, because the belief that one exists would have changed the design.

| Source | Result |
|---|---|
| GitHub contents API, `CSSLab/maia-chess/maia_weights` | Exactly **9 files: maia-1100 … maia-1900**. README: *"our 9 final maia models"* |
| HuggingFace, author-scoped `?author=shermansiu` | maia-1100…1900, **maia-2200**, maia2-blitz, maia2-rapid, unimaia, unimaia-aux. **No 2000/2100/2300/2400** |
| maiachess.com "600 to 2600" | Refers to what the *approach* can target, and to Maia-2/Maia-3 — not to released Maia-1 nets |

The roster's `maia-2200` is a **third-party community fine-tune** from `CallOn84/LeelaNets`, not from
CSSLab. Its own model card states: *"It is a move-prediction model, not a calibrated estimate of an
individual player's strength."* That is external corroboration of the negative result in §1.3, and
it means `maia-2200` is **not a comparable rung** on a calibration ladder — different trainer,
different pipeline.

**Consequence:** the 1900→2200 gap and `optional: true` flag stay as-is. A higher ladder requires
Maia-2/Maia-3, not more Maia-1 nets — see `docs/research/skill-models.md`.

---

## §1.2 The canonical method, and why it cannot ship as-is

**Regan & Haworth, *Intrinsic Chess Ratings*, AAAI 2011** (DOI `10.1609/aaai.v25i1.7951`) is the
rigorous reference. Its model:

- Evaluate **all legal moves** (MultiPV up to 50) at fixed depth; `δᵢ` = eval gap from best.
- **Non-linear eval scaling**: `ln(1+x)` — asymmetric for players ahead vs behind. Deliberately
  compresses the 2-pawn vs 5-pawn blunder distinction (*"both blunders may be equally fatal"*).
- A −0.03 correction on later equal-top moves.
- Curve `yᵢ = e^(−(δᵢ/s)^c)`, `pᵢ = p₀^(1/yᵢ)`, `Σpᵢ = 1`. `s` = sensitivity, `c` = consistency.
- **Fitting caution:** plain maximum likelihood *"failed to yield even remotely accurate projections"*.
  Grid percentiling was used instead. A direct warning against naive summed-log-likelihood.

**Cost: 6–8 CPU-hours per game.** Against `NFR-A4`'s 214 s budget that is a non-starter.

What *is* transferable, and what Phase 14 adopts:

1. The **`ln(1+x)` scaled error** — the single most important borrowing.
2. Reporting **means fitted against known-Elo reference sets** rather than per-game point estimates
   (Regan §7: *"We have essentially fitted only the means"*).
3. The published **Elo ↔ error correspondence** as an external prior (§1.4).

---

## §1.3 Negative result: uncalibrated Maia move-matching is unusable

On a single game, a Maia-ladder `argmax_elo P(moves | elo)` estimator **inverted**: a carefully
played game scored **1721** and a deliberately terrible one **1756**.

Regan's table explains it quantitatively. Observed move-match rate (`mma`) against Elo:

| Elo | 2700 | 2600 | 2500 | 2400 | 2300 | 2200 | 2100 | 2000 | 1900 | 1800 | 1700 | 1600 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `mma` % | 54.9 | 54.2 | 53.1 | 51.8 | 50.3 | 48.3 | 47.7 | 46.1 | 45.0 | 45.4 | 44.5 | 42.9 |
| `s` | .079 | .092 | .092 | .098 | .108 | .123 | .134 | .139 | .159 | .146 | .153 | .165 |
| `ada` | .060 | .064 | .071 | .074 | .088 | .092 | .102 | .115 | .125 | .122 | .131 | .137 |

The entire move-match signal is **~12 percentage points across 1100 Elo — 1.1 pp per 100 Elo —
and it is not even monotone** (1800 > 1900). Binomial noise on a 40-ply sample at ~45% rate is
**±7.9 pp**, i.e. **±700 Elo at 1 SE**. The noise is ~7× the per-100-Elo signal.

---

## §1.4 Why scaled error, not move-matching — and the noise floor

Least-squares fits of Regan's table, Elo as a function of each statistic:

| Statistic | Fit | R² | Gradient per 100 Elo | Relative gradient |
|---|---|---|---|---|
| `mma` (move-match %) | Elo = −2088.7 + 87.07·mma | 0.975 | 1.12 pp | 2.3% |
| `s` (sensitivity) | Elo = 3629.6 − 11932.65·s | 0.952 | −0.0080 | — |
| **`ada` (scaled error)** | **Elo = 3432.8 − 13034.40·ada** | **0.981** | **−0.0075** | **7.5%** |

**Scaled error carries 3.2× the relative signal of move-matching**, and fits the published table
best. This is the formal justification for building on `cpLoss` rather than on Maia policy — and it
is a happy result, because `cpLoss` is already computed in pass 1 at zero extra engine cost.

One-SE band from a single 40-ply side:

| Estimator | SE over 40 plies | 1-SE Elo band |
|---|---|---|
| Move-match rate | 7.87 pp | **±702 Elo** |
| Scaled error, per-move SD = 1.0× mean | 0.0158 | ±211 Elo |
| Scaled error, per-move SD = 1.5× mean | 0.0237 | **±316 Elo** |
| Scaled error, per-move SD = 2.0× mean | 0.0316 | ±422 Elo |

**±250–300 Elo is the honest one-game figure**, a property of the problem not a defect to tune away.
This is why the design reports a band and a rolling aggregate, and why no test may assert a tight
single-game bound.

---

## §1.5 The Kaggle *Finding Elo* competition — the empirical error floor

The closest published analogue to the exact problem. Retrieved with a headless Chromium (Kaggle's
pages are JS-rendered and return empty to `w3m`/`curl`).

**The task** (Kaggle, Oct 2014 – Mar 2015, 157 teams, 1,873 submissions): *"determine players' FIDE
Elo ratings at the time a game is played, based solely on the moves in one game."* 25,000 training
games with both ratings, 25,000 test games. The metric is **mean absolute error** over both
`WhiteElo` and `BlackElo`. The organisers supplied Stockfish evaluations at **1 second per move on
one core** — comparable to our ≤2.0 s pass-1 budget. The competition description explicitly points
at *"intrinsic performance ratings ... see this draft by Kenneth Regan"* as the reference approach.

**Final private-leaderboard scores** (≈70% of test data):

| Rank | Team | MAE | Notes |
|---|---|---|---|
| 1 | elyase | **155.78** | Stockfish score stats + positional features; ExtraTrees + ElasticNet + autoencoder ensemble |
| 2 | David Joerg | 160.68 | 16 s/move Stockfish, 10-million-game opening book with per-position Elo stats, RF over OLS prediction |
| 3 | Peter Hendrix | 167.83 | |
| 4 | Snow Dog | 178.76 | **best score using only the supplied data** |
| 8 | Dave Spencer | 183.15 | Stockfish at depths 19/13/7, RandomForest |
| ~99 | — | 202.50 | |

**The baseline is the number that matters.** The training Elo distribution: median ≈ 2270, quartiles
≈ 2100/2450, so IQR ≈ 350 and a normal-equivalent σ ≈ 260 Elo. A **constant predictor** (always
guess the median) therefore scores MAE ≈ 0.80σ ≈ **207**. Against that:

| Approach | MAE | vs constant | implied R² | residual σ |
|---|---|---|---|---|
| Constant (predict the median) | ~207 | — | 0.00 | 260 Elo |
| **Winner** — external data + 16 s/move | **155.78** | **−25%** | **0.43** | **~195 Elo** |
| Best using only supplied data | ~177 | −14% | 0.27 | ~222 Elo |
| Typical supplied-data-only entry | ~191 | −8% | 0.15 | ~239 Elo |
| Rank ~99 of 157 | ~202 | −2% | 0.04 | ~254 Elo |

**Roughly half the field failed to meaningfully beat guessing a constant.** A world-class effort
explains about **43% of the single-game Elo variance and leaves a ~195 Elo residual SD.** Restricted
to what we actually have (no opening-Elo book, ~1–2 s/move), the best achieved is **~222 Elo
residual SD**. This is independent empirical confirmation of §1.4's derivation.

**Five findings that changed the design:**

1. **Engine time barely matters.** The 2nd-place finisher measured it directly: doubling from 2 s to
   4 s per move improved MAE by **0.3 points**, 4→8 s by 0.4, and 8→16 s by 0.4. An **8× compute
   increase bought 1.1 MAE points — 0.7%.** Our pass-1 budget is already on the plateau.
2. **Regan's Bayesian model added nothing.** The 2nd-place finisher implemented *Skill Rating by
   Bayesian Inference* (DFHR09) and reports it *"did not add enough score to be worth including. I
   suspect that the quantiles of player error were fulfilling a similar role."* A robust summary of
   per-move error captures essentially what the sophisticated model does.
3. **Nobody ran Regan's full MultiPV method.** Both competitors who considered it cite compute cost.
   Independent confirmation of §1.2's cost objection.
4. **Winsorised/robust per-move error is the standard winning feature.** The winner used
   *"mean_abs, std etc of the evaluation difference"* — precisely the `(mean, sd)` sufficient
   statistics stored in `strength_samples`. The 2nd place's strongest single feature, `q_error_one`,
   is the 25th percentile of clipped centipawn loss. The 8th place independently applied
   **`log(1 + x)`** as a feature expansion.
   *Naming caveat:* the two descriptions of `q_error_one` in the Kaggle discussion are mutually
   inconsistent ("25th percentile" vs "the median equity lost in the worse half" — the same number
   only on a descending sort). Rather than transcribe an ambiguous name, §3.4 of the plan defines
   `p75Loss` from scratch.
5. **The game *mean* is far easier than the per-side split.** The winner: *"I got around 60 MAE
   when predicting the mean ELO"* — versus 155.78 for individual ratings. Pooling is where the
   accuracy is, which is why the rolling aggregate is not decoration.

**One design tension worth stating.** Several teams improved their score by fitting separate models
per colour × result. `FR-GRADE-10` forbids that. This is deliberate: measuring intrinsic performance
means the result must not leak in — and keeping it out is what makes every Maia game a valid
calibration sample.

**Incidental confirmation for Phase 13:** Kaggle's supplied evaluations are documented as *"the
current advantage, in cp, of white at each move"* with *"negative values indicate black has the
advantage"* — a single White-relative series, exactly the convention `src/ports/engine-client.js`
promises.

---

## §1.8 Bibliography

- Regan, K. W. & Haworth, G. M. (2011). *Intrinsic Chess Ratings*. AAAI 2011.
  DOI `10.1609/aaai.v25i1.7951`. PDF: `cse.buffalo.edu/~regan/papers/pdf/ReHa11c.pdf`
- McIlroy-Young, R., Sen, S., Kleinberg, J. & Anderson, A. (2020). *Aligning Superhuman AI
  with Human Behavior: Chess as a Model System*. KDD 2020. arXiv:2006.01855
- *Maia-2: A Unified Model for Human-AI Alignment in Chess*. NeurIPS 2024. arXiv:2409.20553
- Guid, M. & Bratko, I. *Computer Analysis of World Chess Champions*. ICGA Journal.
- Regan, K. W., Dailey, D., Fischer, S. & Haworth, G. *Skill Rating by Bayesian Inference*.
  `cse.buffalo.edu/~regan/papers/pdf/DFHR09.pdf` — implemented by the Kaggle 2nd place and
  found to add nothing over quantiles of per-move error.
- Cukierski, W. (2014). *Finding Elo*. Kaggle. Winning score **155.78** MAE.
- Competitor write-ups: `finding-elo/discussion/13008` (1st, 2nd, 4th and 8th place methods),
  `finding-elo/discussion/12580` (best score without external data, ~177),
  `finding-elo/discussion/11187` (why nobody ran Regan's MultiPV method).
  Code: `elyase/kaggle-elo` (1st), `dsjoerg/blundercheck` (2nd), `rozim/KaggleFindingElo` (8th).
  *Retrieval note: Kaggle renders client-side; retrieved with headless Chromium via Playwright.*
- `CSSLab/maia-chess` — `maia_weights/` (9 nets, 1100–1900), GPL-3.0
- `shermansiu/maia-2200` HuggingFace model card (upstream: `CallOn84/LeelaNets`)
- Monroe, D. et al. (2026). *Chessformer: A Unified Architecture for Chess Modeling*. ICLR 2026.
  arXiv:2605.19091. Maia-3 reaches 57.1% move-matching with <¼ the parameters of prior SOTA.
- `lichess-org/api`, `doc/specs/tags/openingexplorer/lichess.yaml`
- Negative results from this project: the measured Maia-ladder inversion (§1.3) and the
  signal-to-noise derivation (§1.4)

*Phase 15 asset research (Maia-2, Maia-3, opening-Elo book) is recorded in
`docs/research/skill-models.md` and `docs/research/opening-elo-book.md`.*
