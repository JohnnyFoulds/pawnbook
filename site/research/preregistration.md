---
title: Research Preregistration
---

# Research Preregistration

**Registration date:** 2026-08-29, before any coach-enabled game was played.

**Amendment policy:** This document is append-only after the first coach-enabled game. No retroactive changes to hypotheses, measures, or falsification criteria are permitted. Amendments are appended at the end with a date and rationale.

---

## RQ1 — Are deliberate opening deviations improvements, regressions, or neutral?

**Background.** When the coach alerts and the player chooses to keep their move (a "keep" choice), a challenge opens. The challenge is eventually resolved by one of nine rules, yielding evidence about whether the deviation was a genuine improvement, a regression, or strategically neutral. RQ1 asks what the distribution of outcomes looks like across closed challenges.

**Operational measure.**

- Primary: `engine_delta_win_pts` — challenger win% minus incumbent win% at depth-22 MultiPV-3. Positive = challenger is engine-preferred; negative = challenger is engine-disfavoured.
- Secondary: Elo-adjusted result performance in games after the challenge was opened, for both challenger and incumbent moves.

**Analysis method.** Signed mean and 95% bootstrap confidence interval of `engine_delta_win_pts` across closed challenges. Categorise outcomes: positive (> +2 win%) = improvement, negative (< −2 win%) = regression, neutral (within ±2 win%) = strategically equivalent.

**Minimum sample.** 20 closed challenges with ≥ 3 distinct EPD positions (not all from the same position).

**Stopping rule.** After ≥ 20 closed challenges meeting the position-diversity criterion.

**Falsification criterion.** If ≥ 80% of closed challenges are engine-neutral and Elo-adjusted result performance is not statistically different between challenger and incumbent positions, the hypothesis that deliberate deviations represent meaningful improvement is falsified. The null hypothesis (deviations are noise) is retained.

---

## RQ2 — Can a usable repertoire be learned purely from game encounters?

**Background.** pawnbook builds a repertoire automatically from game play, with no manual move selection or curation. RQ2 tests whether this produces a usable book within a reasonable number of games.

**Operational measures.**

- `coverage_pct` (reach-weighted, from `/api/repertoire/coverage`) measured at games 10, 20, 30, 40, 50
- `expected_depth` (reach-weighted mean confirmed depth) measured at the same milestones
- `curation_event_count` — number of manual reversals performed via `/api/repertoire/changelog/:id/reverse`

**Hypothesis.**

- `coverage_pct` reaches ≥ 80% within 50 games
- `expected_depth` increases monotonically across milestones
- `curation_event_count` = 0 (zero manual intervention required)

**Analysis method.** Time series plot of `coverage_pct` and `expected_depth` at each milestone. Count of reversals.

**Minimum sample.** 50 games with `coachEnabled = true`.

**Stopping rule.** After 50 eligible games.

**Falsification criteria.**

- `coverage_pct` < 60% at game 50 falsifies the coverage hypothesis
- Non-monotone `expected_depth` (a decrease from one milestone to the next) falsifies the depth-growth hypothesis
- `curation_event_count` > 3 falsifies the zero-curation-cost claim

---

## RQ3 — Does a style-tolerant book outperform an engine-optimal one for this player?

**Background.** pawnbook's admission system is deliberately style-tolerant: rule-5 (style-call) promotions allow moves that the engine does not prefer, as long as the soundness gates pass and result evidence is supportive. RQ3 tests whether these style-call promotions lead to better or worse outcomes than engine-optimal (rule-2) promotions.

**Operational measures.**

- Per rule-5 promotion: `engine_delta_win_pts` (expected to be negative — engine prefers the incumbent)
- Per rule-5 promotion: Elo-adjusted result performance in subsequent games at the promoted position
- Comparison group: rule-2 (engine-clear) promotions at matched positions

**Design.** Natural experiment. Rule-5 promotions are naturally occurring cases where the system chose style over engine optimality. Rule-2 promotions are the engine-optimal control group.

**Analysis method.** Compare mean result performance (Elo-adjusted) for rule-5 vs rule-2 promotions. t-test or Mann-Whitney U test depending on sample size and distribution.

**Minimum sample.** 10 rule-5 (style-call) promotions with ≥ 5 subsequent games each.

**Stopping rule.** After ≥ 10 qualifying rule-5 promotions with sufficient follow-up games.

**Falsification criterion.** If rule-5 promotions produce statistically worse result performance than rule-2 promotions (one-tailed t-test, p < 0.1), style-tolerance is not net positive for this player. The engine-optimal strategy is preferred.

---

## RQ4 — Does FSRS of self-authored moves reduce opening deviations?

**Background.** pawnbook creates opening drill cards from canonical repertoire nodes. These cards are scheduled via FSRS and become "mature" (stability > 10 days) after repeated correct recalls. RQ4 tests whether drilling these self-authored moves reduces the rate of in-game opening deviations.

**Operational measure.** Deviation rate: number of coach alerts per game, measured in blocks of 5 games.

**Design.** Interrupted time series with preregistered alternation scheme:
- Blocks of 5 games alternate `coachEnabled = true` and `coachEnabled = false`
- This controls for the coach effect itself (which may reduce deviations independently of drilling)
- Treatment is defined as ≥ 10 repertoire nodes having mature cards (stability > 10 days)

**Analysis method.** Compare mean deviation rate (per game) in coach-on blocks before vs after the treatment threshold (10 mature cards). Paired t-test or Wilcoxon signed-rank test on block-level rates.

**Minimum sample.** 10 repertoire nodes with mature cards (stability > 10 days), with ≥ 5 coach-on game blocks both before and after the threshold.

**Stopping rule.** After the conditions above are met and ≥ 5 post-treatment coach-on blocks have been played.

**Falsification criterion.** No significant reduction (p > 0.1, two-tailed) with ≥ 10 mature nodes and sufficient game blocks falsifies the FSRS-drilling hypothesis. Drilling self-authored opening moves does not reduce deviation rate.

---

## RQ5 — Does Maia-policy reach probability predict actual encounter frequency?

**Background.** pawnbook computes the probability of reaching each book node using a BFS over Maia's policy distribution. This reach probability is used for coverage weighting, gap ranking, and puzzle queue ordering. RQ5 tests whether this probability actually predicts how often positions are encountered in real games.

**Operational measures.**

- Per confirmed book node: `reach_prob` (predicted, from Maia BFS)
- Per confirmed book node: observed encounter rate = games where this EPD position was reached / total games

**Analysis method.**

- Calibration curve: bucket predicted reach into deciles; plot mean predicted vs mean observed
- Brier score: mean squared error between predicted reach and observed encounter rate per node
- Pearson correlation between predicted and observed

**Minimum sample.** 100 games (to give stable encounter rate estimates at low-reach nodes).

**Stopping rule.** After 100 eligible games played with `coachEnabled = true`.

**Falsification criteria.**

- Brier score > 0.05 falsifies the calibration hypothesis
- Systematic miscalibration (e.g., nodes predicted at 0.8 reach consistently observed at < 0.3) falsifies the reach model

**Note on strength of this RQ.** This is the most mechanistically constrained RQ: pawnbook's opponents are Maia nets at known Elo levels, and the reach probability is computed from the same Maia policy that generates moves during play. The calibration is exact in principle (given stable player behaviour and no transposition from unexpected lines). Even moderate miscalibration would be informative about the limits of the BFS approximation.

---

## RQ6 — Is the learned book identifying to this player?

**Background.** If the book truly reflects the player's style, the distribution of book moves at each position should diverge from the generic Maia-1500 policy in characteristic ways. Positions where the book strongly prefers a move that Maia-1500 disfavours are the most "identifying" — they encode genuine stylistic choices.

**Operational measure.**

- Per confirmed node: KL divergence of player move distribution vs Maia-1500 policy at that EPD
- Player move distribution: frequency of each move played at this position across all games

**Analysis method.**

- Mean KL divergence across all confirmed nodes
- Distribution of per-node KL divergences (identify high-divergence nodes)
- Comparison baseline: KL divergence of randomly sampled Maia-1500 moves vs Maia-1500 policy (expected near-zero)

**Minimum sample.** 50 confirmed nodes with ≥ 5 games each (for stable frequency estimates).

**Stopping rule.** After 50 confirmed nodes with sufficient game counts.

**Falsification criterion.** If mean KL divergence is not statistically different from baseline (permutation test, p > 0.1) with ≥ 50 qualifying nodes, the book is not identifying — it mirrors Maia-1500's generic preferences rather than the player's personal style.

---

## Minimum viable dataset for publication

| RQ | Likely order | Rationale |
|---|---|---|
| RQ5 | First | Calibration is mechanistically determined; 100 games is achievable in 2–3 months of regular play |
| RQ2 | Second | Passage of time confirms or falsifies coverage growth; 50 games achievable alongside RQ5 |
| RQ4 | Third | Requires card maturation — typically 3–6 months for stability > 10 days |
| RQ1 | Fourth | Requires enough closed challenges — 20 challenges may take 6+ months |
| RQ3 | Fifth | Requires 10 rule-5 promotions, which depend on sufficient challenges first |
| RQ6 | Last | Requires 50 confirmed nodes with game counts — likely available by month 6 |

---

## Amendments

*No amendments recorded. This section is append-only.*
