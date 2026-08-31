---
title: Methodology & Design
---

# Methodology & Design

This page describes the research design behind pawnbook's empirical components: the theoretical framework, experimental approach, and honest accounting of what can and cannot be concluded from a single-subject study.

## Design Science Research

The work follows the DSR framework (Hevner 2004). DSR studies create and evaluate IT artefacts to solve identified organisational or social problems. The seven DSR guidelines (Hevner et al. 2004, Table 2) apply:

| Guideline | Application in pawnbook |
|---|---|
| Design as artefact | The auto-repertoire system and analysis pipeline are the primary artefacts |
| Problem relevance | No existing system supports in-game deviation alerting against a self-learned book |
| Design evaluation | Longitudinal journey test suite; six preregistered RQs |
| Research contributions | Novel: in-game alert from own-play-learned book; style-tolerant admission; reach probability from actual opponent policy |
| Research rigor | Preregistered hypotheses; falsification criteria; negative-result documentation |
| Design as search process | Balance parameters with explicit rationale; defect register; phase reviews |
| Communication of research | This documentation; planned publication |

The DSR cycle (Peffers et al. 2007) maps to the project phases: problem identification (Phases 0–1), objectives (Phases 2–16), design and development (Phases 17–39), demonstration (journey harness, Playwright), evaluation (ongoing via RQ measurements), and communication (this site).

## Experimental design: n-of-1

pawnbook uses a single-case experimental design (Barlow & Hersen 1984). The sole participant is the author-developer.

### Justification

**The repertoire is personalised and non-transferable.** A book learned from player A's games reflects A's move preferences, opponent pool, and playing style. There is no meaningful "average book" to compare across subjects. Each participant is their own control.

**Measurement requires owning the game loop.** Chess.com and Lichess prohibit third-party tools that provide in-game analysis assistance. A real test of the coach system requires a platform that owns the full pipeline from move entry to repertoire alert. pawnbook is that platform.

**The primary RQs are calibration and convergence questions.** RQ5 (does Maia reach probability calibrate against actual encounter frequency?) is answered definitively by a single subject with sufficient games, because the opponents ARE Maia at a known Elo — the probabilities are exact in principle.

### Role of the participant

The participant is the researcher. This introduces a potential **demand characteristic** (awareness of being measured may change behaviour). Mitigation: pawnbook's measurements are passive — the researcher cannot easily modify natural play behaviour to inflate metrics. The repertoire and drill systems are driven by what moves are actually played, not by how moves are reported.

### Preregistration

All six research questions were preregistered on 2026-08-29, before the first coach-enabled game was played. See [Preregistration](/research/preregistration) for the full document. The amendment policy is append-only after first coach-enabled game — no retroactive changes.

## Interrupted time series (RQ4)

RQ4 (does FSRS drilling reduce deviation rate?) uses an interrupted time series design:

1. **Baseline phase**: coach enabled, no cards mature (stability < 10 days) — measure deviation rate
2. **Treatment phase**: cards mature (stability ≥ 10 days) — measure deviation rate
3. **Compare**: t-test or Wilcoxon signed-rank test on block-level rates

### Confound control: alternation scheme

A potential confound: the coach itself (not the FSRS cards) may reduce deviations. To separate the coach effect from the drilling effect, a preregistered alternation scheme is used:

- Games are played in pairs of 5 with `coachEnabled` alternating (on/off/on/off...)
- This prevents "coach always paired with fresh cards" from confounding the measurement
- Deviation rate is measured separately in coach-on and coach-off blocks

The alternation scheme is preregistered and cannot be changed retroactively.

## Personal informatics framing

pawnbook is framed using the personal informatics model of Li, Dey & Forlizzi (2010), which describes five stages of self-tracking systems:

| PI stage | pawnbook implementation |
|---|---|
| **Preparation** | Opponent selection, time control, coach toggle |
| **Collection** | Passive — game moves, evaluations, timestamps captured automatically |
| **Integration** | Analysis pipeline: three-pass move grading, strength estimation, puzzle extraction |
| **Reflection** | Review page (per-move eval), stats page, repertoire coverage/journey |
| **Action** | Drill queue (FSRS); coach alert (in-game); gap report (targeted practice) |

Most self-tracking systems break down at the action stage — data is collected and reflected on, but no mechanism converts insight into changed behaviour. pawnbook's coach is an unusual case of a well-matched action stage: the intervention fires at the exact moment of the behaviour it is trying to change.

## Limitations

**Single subject.** All findings are specific to:
- One player's style, preferences, and Elo band (~1200–1600)
- One opponent pool (Maia-1100 to Maia-2200, Stockfish)
- One time period, with no external validation

**Measurement instrument and treatment are not independent.** For RQ2 (does the book grow usably?) and RQ3 (style tolerance), the book being measured is also the book that is being updated as measurement proceeds. There is no frozen baseline.

**No control condition for RQ1 and RQ3.** We cannot observe "what would have happened without the deviation" — the counterfactual is unavailable. Engine delta and result performance are proxies, not direct measurements of improvement.

**Operator knowledge.** The researcher knows the system's internals and could, in principle, game the metrics. No attempt was made to do so; but readers should be aware this is an unverified assumption.

**Narrow opponent pool.** All opponents are either Maia nets (human-like play) or Stockfish (tactical play). Findings about the repertoire may not generalise to tournament play against human opponents.

**Any claim beyond "this worked for this player"** requires replication under a controlled protocol with a second participant and formal ethics approval.

## References

Barlow, D. H., & Hersen, M. (1984). *Single case experimental designs: Strategies for studying behavior change* (2nd ed.). Pergamon Press.

Hevner, A. R., March, S. T., Park, J., & Ram, S. (2004). Design Science in Information Systems Research. *MIS Quarterly*, 28(1), 75–105.

Li, I., Dey, A., & Forlizzi, J. (2010). A stage-based model of personal informatics systems. *Proceedings of CHI 2010*, 557–566.

Peffers, K., Tuunanen, T., Rothenberger, M. A., & Chatterjee, S. (2007). A Design Science Research Methodology for Information Systems Research. *Journal of Management Information Systems*, 24(3), 45–77.
