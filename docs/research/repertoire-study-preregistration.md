# Preregistration — auto-repertoire formation study

**Registered:** 2026-08-29 (before any game is played with the system)  
**Author:** Johannes Foulds  
**Platform:** pawnbook, local instance, `data/chess.db` empty at registration time  
**Amendment policy:** This document may be amended only by append with reason and date. No section
may be rewritten after the first game is played with the coach enabled.

---

## Purpose

This study uses pawnbook's auto-repertoire system as both an artefact and a measurement instrument.
It constitutes self-study — the author is the sole participant — on the author's own data. No other
participants are involved; UNISA human-subjects clearance is not required at this scope.

The system collects data as a by-product of normal play. The research questions below are
stated before any data exists so that the analysis is confirmatory rather than post-hoc.

---

## Research questions, hypotheses, and measurements

### RQ1: Are deliberate deviations from one's own book improvements, regressions, or neutral?

**Hypothesis:** When a player refuses a book alert (i.e. consciously decides to play something
other than their own established move), the deviation is more likely to be an improvement or neutral
than a regression, because the decision was deliberate and in-position rather than a memory failure.

**Operational measure:**
- Unit: each `rep_challenges` row where `status ∈ ('promoted','rejected','abandoned')`.
- Engine signal: `engine_delta_win_pts = winPct(challenger) − winPct(incumbent)` at depth 22,
  MultiPV 3. Positive = challenger better.
- Result signal: Elo-adjusted performance delta = `result_challenger_perf − result_incumbent_perf`,
  using `score − 1/(1 + 10^((opponent_elo − elo_before)/400))`.
- Interpretation: `refusal_hit_rate = fraction of closed challenges where challenger was promoted`.

**Analysis method:** Descriptive statistics (mean, median, distribution) of `engine_delta_win_pts`
and result delta per closed challenge. Sign test against null hypothesis of zero median. Per-rule
breakdown (was the promotion driven by engine, results, or style?).

**Minimum sample:** 20 closed challenges (any status).

**Stopping rule:** Analysis is run at 20, 50, and 100 closed challenges. Conclusions are
updated at each milestone. The study does not end; it accumulates.

**What would falsify the hypothesis:** Median `engine_delta_win_pts` significantly negative at the
50-challenge milestone, with result signal agreeing, and fewer than 25% of challenges promoted.

---

### RQ2: Can a usable personal repertoire be learned purely from encounter, with no curation?

**Hypothesis:** Coverage % will reach 80% within 50 games, and expected in-book depth will increase
monotonically with games played (allowing for early noise), with zero manual curation actions.

**Operational measure:**
- Coverage % at game N: as defined in `feature_spec.md §FR-REP-REACH-3`.
- Expected in-book depth at game N: `feature_spec.md §FR-REP-REACH-4`.
- Interaction cost: alerts per game (decreasing = book is working).
- Curation actions: manual reversals via `POST /changelog/:id/reverse` (should be rare).

**Analysis method:** Time series of coverage % and expected depth vs cumulative games played.
Interaction cost per 10-game window. Count of reversals.

**Minimum sample:** 50 games.

**Stopping rule:** Assessed continuously; reported at 50, 100, and 200 games.

**What would falsify the hypothesis:** Coverage % not above 60% after 100 games, or interaction cost
(alerts/game) not declining after the first 20 games.

---

### RQ3: Does a style-tolerant book outperform an engine-optimal one for this player?

**Hypothesis:** Lines where the style-call promotion rule (§FR-REP-CHAL-4 rule 5) fired — moves the
engine dislikes but the player's results support — will show higher Elo-adjusted performance than
adjacent lines where the engine-optimal move was retained.

**Operational measure:**
- Natural experiment: nodes with a `resolution_rule = '5'` (style-call) promotion vs nodes where
  rule 1 or 2 governed.
- Elo-adjusted performance per node type, using `rep_challenges` + `games`.

**Analysis method:** Paired within-node comparison where available; between-node descriptive
statistics otherwise. N is expected to be small (style-call promotions are rare by construction).

**Minimum sample:** 10 style-call promotions.

**Stopping rule:** Reported when the 10-promotion threshold is reached. May take > 200 games.

**Confound:** Different nodes have different opponents and dates. Elo-adjustment mitigates but does
not eliminate opponent-quality confound.

**What would falsify the hypothesis:** Style-call nodes showing systematically lower
Elo-adjusted performance than engine-preferred nodes at equal sample sizes.

---

### RQ4: Does FSRS of self-authored opening moves reduce deviations?

**Hypothesis:** At nodes where an opening drill card has matured (FSRS stability > 10 days),
the deviation rate will be lower than at matched nodes without a mature card.

**Operational measure:**
- Deviation rate per node per 10-game window.
- FSRS stability at the node's drill card (`fsrs_cards.stability`).
- Coach-on vs coach-off contrast (see confound below).

**Analysis method:** Single-case interrupted time series: deviation rate before and after card
maturation per node, with coach-on games only.

**Minimum sample:** 10 nodes with mature cards (stability > 10 days).

**Stopping rule:** Assessed at 100 games and every 50 thereafter.

**Critical confound — the coach/drill confound:** A node gets a drill card and becomes
coach-eligible at nearly the same time (both happen at confirmation). "Deviations fell after the
card appeared" cannot separate FSRS from being alerted. **The per-game coach toggle
(`games.coach_enabled`) is the lever:** alternating coached and uncoached games gives a
within-subject contrast.

**Preregistered alternation scheme:** Starting from the first game with a confirmed book, games
alternate coach-on / coach-off in pairs of 5: games 1–5 coach-on, 6–10 coach-off, 11–15 coach-on,
etc. (Implemented via the game creation UI; deviation from this scheme must be logged with reason.)
Without this scheme, RQ4 is not answerable from this instrument and must be reported as inconclusive.

**What would falsify the hypothesis:** No significant deviation rate difference between coach-off
games before and after card maturation.

---

### RQ5: Does Maia-policy reach probability predict actual encounter frequency?

**Hypothesis:** The predicted 1-in-X frequency (from `rep_policy`) will be well-calibrated against
the observed encounter frequency at each node, with a Brier score < 0.05 on the calibration curve.

**Operational measure:**
- Predicted frequency: `rep_nodes.reach_prob` (from Maia policy at nearest Elo).
- Observed frequency: `rep_nodes.times_reached / total_games_in_window`.
- Calibration curve: 10 buckets of predicted probability; plot mean predicted vs mean observed.
- Brier score: mean squared error between predicted and observed.

**Analysis method:** Reliability diagram + Brier score. Run at 100 and 200 games.

**Why this is the cleanest RQ:** The opponents *are* Maia at a known Elo, so the policy probability
is exact rather than estimated from a crowd. This is a genuine calibration study, not an n-of-1
anecdote.

**Minimum sample:** 100 games (for at least 10 data points per bucket).

**What would falsify the hypothesis:** Brier score > 0.10, or systematic over-/underestimation in
high-probability buckets.

---

### RQ6: Is the learned book identifying — does it constitute a stylometric fingerprint?

**Hypothesis:** The distribution of canonical move choices will diverge from the Maia-1500 policy
baseline in a consistent, player-specific direction, measurable by KL divergence per position.

**Operational measure:**
- Per node: `KL(player_distribution || maia_policy)` where `player_distribution` is the empirical
  distribution of self-directed observations over the player's moves at that node.
- Aggregate: mean KL divergence over all confirmed nodes; comparison to the individual-level Maia
  personalisation results from McIlroy-Young et al. (KDD 2022).

**Analysis method:** Descriptive; linked to the individual-behaviour-modelling literature.

**Minimum sample:** 50 confirmed nodes.

**What would falsify the hypothesis:** Player distribution indistinguishable from Maia-1500 policy
at the confirmed nodes (KL divergence near zero).

---

## Confounds and mitigations

| Confound | Affects | Mitigation |
|---|---|---|
| Opponent strength / tilt / form vary across games | RQ1 result signal, RQ3 | Elo-adjust all performance measurements; require `REP_CHALLENGE_MIN_GAMES` before result signal decides |
| Coach presence vs FSRS | RQ4 | Preregistered alternation scheme (above); report separately for coach-on and coach-off |
| Challenger played with fresh attention, incumbent by habit | RQ1 short-term | Trend signal at +2/+4/+6 plies is a partial check; long-run refusal hit-rate is the real answer |
| Book changes while being measured | All RQs | `book_version` stamp on every row; analyses condition on book state at decision time |
| Single subject | All RQs | n-of-1 / single-case design explicit; no claims about other players |
| Novelty effect on new lines | RQ4 | Require card stability > 10 days before counting as "mature" |

---

## Minimum viable dataset for publication

| RQ | Publishable threshold |
|---|---|
| RQ1 | 50 closed challenges with full engine A/B data |
| RQ2 | 200 games with complete coverage time series |
| RQ3 | 10 style-call promotions |
| RQ4 | 100 games with alternation scheme applied |
| RQ5 | 100 games (Brier score computable) |
| RQ6 | 50 confirmed nodes |

RQ5 is the most likely to produce publishable results quickly (no minimum game count bottleneck,
calibration is exact by construction).

---

## Honest limitations (stated upfront)

1. **Single subject.** Results are case-study evidence. No claims about other players.
2. **Book moves while measured.** The book adapts while the player plays, so the "treatment" changes
   over time. `book_version` mitigates but does not eliminate this.
3. **No control condition for RQ1/RQ3.** We never observe the incumbent and challenger in the same
   game. Elo-adjustment is the only available control.
4. **Opponent pool is narrow.** All opponents are Maia bots at one of a small set of Elo levels.
   Calibration results (RQ5) may not transfer to human opponents.
5. **Claiming causal effects on playing strength is not supported** by this design and will not be
   attempted.

---

## Amendment log

*(Append only. Do not edit above this line after first coach-enabled game.)*
