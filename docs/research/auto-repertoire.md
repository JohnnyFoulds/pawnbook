# Literature review — auto-repertoire

**Date:** 2026-08-29  
Style: `docs/research/strength-estimation.md` (existing house style).

---

## Purpose

Records what was borrowed from prior work and why. The companion document
`auto-repertoire-prior-art.md` covers what was surveyed and what was found novel. This document
covers the positive borrows only.

---

## Drop-out expansion and cumulative line budget

**Source:** Lincke, T. (2000). *Strategies for the Automatic Construction of Opening Books.*
In T. Marsland & I. Frank (Eds.), *Computers and Games* (LNCS 2063, pp. 74–93). Springer.

Lincke's central contribution: expand only lines where *your* side plays its book move and the
opponent may deviate. Priority `= −Σ errors(path) − c · depth`. Two ideas borrowed directly:

1. **Cumulative line budget** (`REP_LINE_BUDGET_WIN_PTS = 20`): a line that accumulates more than
   the threshold in own-move loss is not worth extending, regardless of how good any individual move
   is. This is §FR-REP-GATE-3.
2. **Depth-aware priority** for coverage expansion: deeper nodes get lower priority, biasing the book
   toward breadth at shallow plies before depth at rare ones.

**Where we differ:** expansion is encounter-driven in pawnbook, not search-driven. A node enters
only when a real game reaches it. Reach probability is for prioritisation, not for inventing moves.

---

## Result-driven and search-driven book learning

**Source:** Hyatt, R. (1999). *Book Learning — a Methodology to Tune an Opening Book Automatically.*
*ICGA Journal*, 22(1), 3–12.

Two learning signals run in parallel:

- **Result-driven:** track W/D/L per line; a line that consistently loses is a candidate for change.
- **Search-driven (trend):** track the engine eval at +N plies out of book — if the position
  deteriorates just outside the book, the book move was at least partly responsible.

Borrowed as the trend signal in challenge resolution: `trend_challenger`/`trend_incumbent` at
`+REP_CHALLENGE_TREND_PLIES = [2,4,6]` plies forward (§FR-REP-CHAL-4 rules 4–5, §FR-REP-CHAL-6).

**Note:** "forward" is the only direction. An earlier draft of the spec said `±TREND_PLIES`, which
includes plies *before* the decision node — meaningless for a causal claim. The design review
corrected this to forward-only.

---

## Reasonable alternatives; add/delete asymmetry

**Source:** Buro, M. (1999). *Toward Opening Book Learning.*
*ICCA Journal*, 22(2), 98–102.

**Source:** Hirsch, M. (2001). *Machine Learning in MChess Professional.*
In *Advances in Computer Games* 9.

Buro: when a line is performing badly, prefer *finding a reasonable alternative* over simply
deleting the line. This motivates keeping `alt` moves alongside a canonical one, and the challenge
mechanism that adopts a better move rather than just retiring the worse one.

Hirsch: add a move when the score just out of book is not too low *and* the later score is
satisfactory; delete when the later score is worse. Explicitly asymmetric thresholds for add vs
delete. This is exactly our admit/quarantine/refuse ladder (§FR-REP-GATE), and the challenge rules'
generous-toward-adoption / stingy-toward-removal asymmetry (the neutral band `[−3, +2)` in
`REP_CHALLENGE_ENGINE_TOL` vs `REP_CHALLENGE_ENGINE_CLEAR`).

---

## "1 in X games" and the Soundness/Effectiveness/Learnability split

**Source:** Chessbook wiki. `publish.obsidian.md/chessbookwiki`. Accessed 2026-08-29.

The "1 in X games" framing of reach probability: display the node's reach probability as the
reciprocal (e.g. `reach = 0.083` → "1 in 12 games"). This is the representation in §FR-REP-REACH
and in the UI (`public/repertoire.html`).

The three-way quality split — **Soundness** (engine agreement), **Effectiveness** (results),
**Learnability** (drill retention) — is borrowed as the three-objective framework in
`feature_spec.md §Context`. These three objectives genuinely conflict and must all be kept visible
rather than collapsed into one score.

---

## Maia — calibrated human-policy distribution

**Source:** McIlroy-Young, R., Sen, S., Kleinberg, J., & Anderson, A. (2020). *Aligning Superhuman
AI with Human Behavior: Chess as a Model System.* KDD 2020. `doi:10.1145/3394486.3403219`

**Source:** McIlroy-Young, R., Wang, R., Sen, S., Kleinberg, J., & Anderson, A. (2022).
*Learning Models of Individual Behavior in Chess.* KDD 2022. arXiv:2008.10086.

The key property: Maia's policy head is trained to predict *human* moves at a given Elo, producing
a calibrated probability distribution over legal moves. Since pawnbook's opponents *are* Maia at a
known Elo, `p(opponent plays r | position)` is available directly from the policy and is exactly
calibrated to the pool actually played against — no Lichess crawl, no cold-start on priors, and RQ5
becomes a clean calibration study rather than an approximation.

Already probed in `src/domain/analysis/findability.js:nearestMaiaModel` +
`src/adapters/engine/engine-pool.js:getMaiaAnalysisClient`.

---

## Win% / Accuracy grading

**Source:** Lichess Accuracy documentation. `https://lichess.org/page/accuracy`. Accessed 2026-08-29.

Gate thresholds in win% points, not centipawns. A 300cp swing means different things in a balanced
opening versus a tactical melee. Win% loss is position-invariant. Already implemented in
`src/domain/analysis/grade.js:winPct` and `src/shared/balance.js`.

---

## ChessAtlas — deviation split

**Source:** ChessAtlas. `https://chessatlas.com`. Accessed 2026-08-29.

The split between *your* deviation (memory problem → drill it) and *opponent's* deviation (coverage
gap → add a line) is borrowed in §FR-REP-BOOK §5 (the deviation classification table). Different
verdicts for `order_slip`/`lapse`/`novelty` vs gaps in the gap report.

---

## Sielecki, Nunn, and the "understanding first" stance

**Source:** Sielecki, A. (2016). *My First Opening Repertoire.* New in Chess.

*"After each game, compare it to your repertoire"* — the loop pawnbook automates. Also: build a
core repertoire first; depth proportional to how often a line occurs (the reach-probability
prioritisation in §FR-REP-REACH).

**Source:** Nunn, J. (1998). *Secrets of Practical Chess.* Gambit.

Distinguish essential from optional knowledge. Justifies the reach-probability frontier over a
flat ply cap.

---

## Spacing effects and deliberate practice

**Sources (for RQ4 background):**
- Cepeda, N. J. et al. (2006). *Distributed practice in verbal recall tasks.* Psych Bulletin 132.
- Roediger, H. L. & Karpicke, J. D. (2006). *Test-Enhanced Learning.* Psych Science 17.
- Bjork, R. A. (1994). Memory and metamemory considerations in the training of human beings. In
  Metcalfe & Shimamura (Eds.), *Metacognition: Knowing about Knowing.* MIT Press.
- Chase, W. G. & Simon, H. A. (1973). *Perception in chess.* Cognitive Psychology 4.
- Gobet, F. & Simon, H. A. (1996). *The roles of recognition processes and look-ahead search in
  time-constrained expert problem solving.* Psychological Science 7.
- Charness, N. et al. (2005). *The role of deliberate practice in chess expertise.* Applied
  Cognitive Psychology 19.

Spacing and retrieval practice reduce memory failures and improve retention — the assumption
underlying FSRS reuse for opening drill cards (§FR-REP-DRILL).

---

## Design Science Research framing

**Sources (for §10 / methodology document):**
- Hevner, A. R. et al. (2004). *Design Science in Information Systems Research.* MIS Quarterly 28(1).
- Peffers, K. et al. (2007). *A Design Science Research Methodology for Information Systems Research.*
  J of Management Information Systems 24(3).

The system is an artefact; its evaluation is the empirical study of §10. DSR requires positioning
the artefact against existing solutions — done in `auto-repertoire-prior-art.md`.

**Source:** Li, I., Dey, A. K., & Forlizzi, J. (2010). *A Stage-Based Model of Personal Informatics
Systems.* CHI 2010.

Personal informatics framing for the "capture your own research data while playing" angle.
