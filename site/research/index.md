---
title: Research Overview
---

# Research Overview

pawnbook is two things at once: a functional chess training tool and a research instrument. The software is designed to answer empirical questions about personalised chess improvement that cannot be answered with existing platforms.

## pawnbook as a research instrument

Existing chess improvement platforms are closed systems. They do not expose the full game loop: they cannot alert a player mid-move before a deviation commits, they do not own the engine evaluation pipeline, and they cannot be instrumented at the seam between move choice and training outcome. pawnbook owns all of this, which makes it possible to measure things that cannot be measured elsewhere.

The primary research interest is the auto-repertoire system: can a personalised opening book be learned entirely from a player's own games, without manual curation, and can that book meaningfully improve opening play when delivered as both FSRS drill cards and real-time in-game coaching?

## Design Science Research framework

The work follows the DSR cycle (Hevner 2004):

1. **Problem relevance** — personalised repertoire learning from own-game encounters is not done by any existing system (see [prior-art survey in `docs/research/auto-repertoire-prior-art.md`])
2. **Design & development** — pawnbook itself, in particular the auto-repertoire system (Phases 26–39)
3. **Demonstration** — the 30-day longitudinal journey test suite; Playwright visual verification
4. **Evaluation** — the six research questions below, measured on real play data
5. **Communication** — this documentation; planned academic publication

## Experimental design: n-of-1

pawnbook is built around a single-case experiment (Barlow & Hersen 1984). The sole participant is the author.

This is appropriate for three reasons:

- The repertoire system is **personalised** to the subject — a book learned by one player cannot be transferred or pooled with another
- Measurement **requires owning the game loop** — platform chess sites prohibit third-party analysis during play
- The primary research questions (RQ2, RQ5) are about **calibration and convergence**, not group differences — they can be answered from a single subject's data given sufficient game count

Adding a second participant would require UNISA ethics approval and is outside the current scope.

## Research questions

| # | Question | Core method | Minimum sample |
|---|---|---|---|
| RQ1 | Are deliberate opening deviations improvements, regressions, or neutral? | `engine_delta_win_pts` + Elo-adjusted result performance per closed challenge | 20 closed challenges |
| RQ2 | Can a usable repertoire be learned purely from game encounters? | Coverage% over 50 games; expected depth trend; zero curation events | 50 games |
| RQ3 | Does a style-tolerant book outperform an engine-optimal one for this player? | Rule-5 (style-call) vs rule-2 (engine-clear) promotions; natural experiment | 10 style-call promotions |
| RQ4 | Does FSRS of self-authored moves reduce opening deviations? | Interrupted time series; deviation rate before/after card maturation | 10 nodes with mature cards |
| RQ5 | Does Maia-policy reach probability predict actual encounter frequency? | Calibration curve + Brier score | 100 games |
| RQ6 | Is the learned book identifying to this player? | KL divergence vs Maia-1500 policy per confirmed node | 50 confirmed nodes |

Full operational details — measures, analysis methods, stopping rules, falsification criteria — are in the [Preregistration](/research/preregistration).

## Ethics

This is self-study on the author's own data. The participant is the researcher. No personal data from any other person is collected. No human-subjects clearance is required under UNISA guidelines for self-study research without deception. Any extension to a second participant requires formal ethics approval before data collection begins.

## Publication timeline

RQ5 (reach probability calibration) is the most likely to produce early publishable results because the calibration is exact by construction — Maia IS the opponent. 100 games is achievable in a few months of regular play.

See also:
- [Strength Estimation](/research/strength-estimation) — method behind the per-game Elo estimate
- [Methodology & Design](/research/methodology) — detailed DSR and experimental design rationale
- [Preregistration](/research/preregistration) — full RQ specifications, registered before first coach-enabled game
- [Chess Feedback Without an LLM](/research/chess-feedback) — research note on deterministic mistake explanation for sub-1600 players
