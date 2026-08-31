# Chess mistake feedback without an LLM

**Status**: Research note — informing future feature design  
**Date**: 2026-08-31  
**Context**: pawnbook currently surfaces `cpLoss` and `winLoss` on puzzle cards with no prose
explanation. This is opaque to players under roughly 1600, particularly for strategic
inaccuracies. This note surveys the academic and technical literature on how to provide
meaningful, human-readable feedback using only deterministic computation — no LLM, no
network call, runs offline.

---

## 1. What chess pedagogy says about sub-1600 learning

De Groot (1946) and Chase & Simon (1973) established that chess skill is primarily *pattern
library size*, not calculation depth. Players under ~1600 have small chunk libraries — they
don't recognise danger in a position until after it materialises. The direct pedagogical
implication: **abstract evaluation numbers are useless to them; named patterns are not.** A
player who sees "blunder — cpLoss 84" learns nothing they can carry forward. A player who
reads "defender-removal blindness" has a label they can apply to the next game.

Silman's *How to Reassess Your Chess* (2010) operationalises this for club players via a
structured vocabulary of positional *imbalances* (good bishop vs. bad bishop, open files,
outpost squares, weak squares, pawn structure weaknesses) that players can name and track.
Aagaard's *Excelling at Chess* series and Yusupov's nine-volume *Build Up Your Chess*
curriculum converge on the same approach: categorise mistakes with a motif label, then drill
by category.

Charness et al. (2005) — the highest-quality study applying Ericsson's deliberate practice
framework to chess — found that the highest-gain activity for improving players is tactic-puzzle
practice specifically targeted at a known weakness *category*. The implication: the most
valuable feedback unit is not "what went wrong in this position" but "which category of
cognitive error produced this mistake," because that drives the right future drilling.

**Takeaway**: The right feedback unit for a club player is a named motif, not a numeric score.
pawnbook already does spaced repetition; attaching a motif label to each puzzle card closes the
loop — the player sees the motif, the motif maps to a skill dimension, future sessions
prioritise the weakest dimension.

---

## 2. What the cognitive science of feedback says

**Shute (2008)** reviewed 30+ years of feedback research and identified a hierarchy:

| Feedback type | Effect |
|---|---|
| Verification only ("wrong") | Minimal, sometimes negative |
| Knowledge of correct response ("the right move was Rd1") | Moderate |
| Elaborated / response-specific ("Rd1 because your queen was overloaded") | Strongest |

Elaborated feedback shows the largest gain specifically when the learner is within the *zone
of proximal development* — i.e., the task is hard enough to be wrong but not so hard that
the explanation is incomprehensible. Sub-1600 players are in this zone for tactical errors
and simple strategic ones.

**Hattie & Timperley (2007)** propose a four-level model. For chess improvement, the most
neglected level is *process feedback* — identifying which cognitive pattern broke down (missed
attacker, miscounted defenders, skipped prophylaxis). A motif label directly targets this level.

**Kulhavy & Stock (1989)** on corrective feedback: the gap between expected and actual
performance must be *visible* to the learner before elaborated feedback works. Concretely:
showing the player both the move they played and the best move side-by-side is a prerequisite.
pawnbook already does this via `bestMoveSan` and `bestMoveUci`; what is missing is the
explanation of *why* the best move is better.

---

## 3. The available taxonomy of chess errors

**Guid & Bratko (2006, 2011)** used computer analysis of world champions to characterise
*magnitude* of error (average centipawn loss per move). This is useful for strength estimation
— which pawnbook already uses — but does not classify error *type*.

**The practical taxonomy that exists and works** is the Lichess puzzler tactic detector
(`lichess-org/lichess-puzzler`, `tagger/cook.py`). It implements purely rule-based tactic
detection over the board representation and detects:

> fork, skewer, pin (prevents attack / prevents escape), discovered attack, double check,
> back-rank mate, smothered mate, x-ray, interference, clearance, attraction, deflection,
> overloading, en passant, promotion, hanging piece, trapped piece, sacrifice, capturing
> defender

All are boolean functions over bitboard state — no ML. This is the gold standard for
**tactical motifs** and is the directly relevant prior art.

**Chessful** (iOS, documented at lagerland-apps.github.io) extends this to 30 motifs across
5 skill dimensions, adding strategic motifs: defender-removal blindness, king-safety
underestimate, prophylactic skip, weakening pawn push without compensation, wrong piece
exchanged, weak square allowed, wrong pawn break, wrong rook activation, endgame technique
errors. Their implementation is described as "hand-curated rule-based detectors run on top of
Stockfish output, ordered by specificity — the strictest matching rule wins." Entirely
deterministic.

---

## 4. Template-based NLG (without an LLM)

Reiter & Dale (2000) describe a three-stage NLG pipeline: content selection → microplanning
→ surface realisation. For a constrained domain like chess feedback, surface realisation
degenerates to **template instantiation** — which is the appropriate tool for a solo developer
and is far more reliable than deep NLG.

The SUMTIME weather forecast system (Sripada et al. 2003) demonstrated that template NLG
produces human-acceptable text for structured numeric data in narrow domains. Chess feedback is
narrower than weather: roughly 25 motifs × 3 phases × 2 colours ≈ 150 (motif, context)
combinations, each requiring 2–3 sentence variants to avoid monotony. That is approximately
400 template strings — a one-time authoring cost, zero runtime cost.

**Sketch of the approach:**

```js
const MOTIF_TEMPLATES = {
  hanging_piece: [
    "Your {piece} on {to} had no defenders after this move — it could be captured for free.",
    "Moving to {to} left your {piece} undefended. Look for attacked pieces with no safe squares.",
  ],
  fork_missed: [
    "After your move, the opponent's {opponentPiece} on {square} attacked both your {piece1} and {piece2} simultaneously.",
  ],
  overloaded_defender: [
    "Your {defender} on {square} was the only piece covering both {target1} and {target2}. When a single piece has two defensive duties, one of them will fail.",
  ],
  // ...
}
```

Slots (`{piece}`, `{to}`, `{square}`) are filled from data pawnbook already computes: piece
type, source/destination squares, PV first move, phase, mover. The sentence assembles in
< 1 ms at review render time.

---

## 5. Visual feedback alternatives

Arrow overlays showing the best move after a mistake are the minimum viable visual feedback
and are universally implemented in chess software. pawnbook already has `bestMoveUci`;
rendering an arrow on the board at the puzzle position is the natural extension.

**Threat highlighting** — colouring attacked/undefended pieces at the moment of the mistake —
reduces cognitive load by making the error *visible* before naming it. Shute (2008) supports
this as an instance of elaborated feedback through worked examples. Sweller's cognitive load
theory (1988), applied to chess by Gobet & Charness (2006), establishes that visual-first
feedback is particularly effective for lower-rated players whose working memory is saturated
by the position itself.

cm-chessboard (pawnbook's board library) already exposes a square highlight and arrow
overlay API. The hanging square / threat highlight is computable from FEN + `chess.js`
`attacks_to()` in under 1 ms.

---

## 6. What is directly computable from pawnbook's existing data

pawnbook already has, at each analysed ply: FEN, piece type that moved, source square,
destination square, PV (line from Stockfish), `alt_moves_json` (top-3 MultiPV lines), cpLoss,
winLoss, phase, and Maia findability. From this data the following motifs are detectable
without additional engine calls:

**Tactical motifs (deterministic on board state):**

| Motif | Detection method |
|---|---|
| Hanging piece | `isAttacked(to, opponent) && !isDefended(to, player)` after move |
| Piece left en prise | Same check on moved piece's destination |
| Fork missed | PV first move attacks two player pieces simultaneously |
| Overloaded defender | Single opponent piece is sole defender of two attacked squares |
| Back-rank weakness | Player's first rank has no luft; opponent has rook/queen on open file |
| Missed capture | A clearly losing opponent piece was not taken (material delta positive) |
| Defending piece moved | Piece that was defending an attacked square moved away |

**Strategic motifs (from board features + cpLoss threshold):**

| Motif | Detection method |
|---|---|
| Weak square created | Pawn move eliminated control of a key central square, now reachable by opponent |
| Wrong piece exchanged | Material equality but bishop-pair lost, or good bishop traded for bad |
| Prophylaxis missed | PV first move is a defensive move; player moved elsewhere |

All of the above are 20–60 lines of `chess.js` code per motif. The Lichess tagger is a
directly portable reference implementation.

---

## Recommended implementation sequence

### Phase A: Visual threat highlight (2–3 days)

At the mistake position in the puzzle card and review screen, highlight:
1. The square the player's moved piece ended on, if it is attacked and undefended (red)
2. The attacker (orange arrow)
3. The best move destination (green arrow)

This requires no new data, no template authoring, and immediately makes tactical errors
visible without any text.

### Phase B: Motif classifier + template labels (2–3 weeks)

1. Implement a `classifyMistake(fen, movePlayed, pv, altMoves, phase)` function in
   `src/domain/analysis/motif-classifier.js` that returns a `motifTag` string (e.g.
   `'hanging_piece'`, `'fork_missed'`, `'overloaded_defender'`, `'positional_inaccuracy'`).
   Start with the 10 most common tactical motifs; add strategic motifs incrementally.

2. Persist `motifTag` on the `puzzles` table (new column, nullable).

3. Author a template library in `src/shared/motif-templates.js`: 2–3 sentence variants per
   motif with slot-filling from existing puzzle data fields.

4. Render the motif label and one template sentence on the puzzle card (drill and quiz
   screens) and on the review page mistake list.

### Phase C: Skill-dimension aggregation (1 day, after Phase B)

Once motif tags exist on puzzles, aggregate by skill dimension (Tactics / Defense /
Positional / Endgame) across the last N games. Surface the top-1 weak dimension on the stats
page: "7 of your last 12 mistakes were defender-removal or back-rank errors. Your drill queue
prioritises these." This directly implements the deliberate practice prescription from
Charness et al. (2005).

---

## What not to build

- **Full NLG pipeline**: Reiter & Dale is overkill for 25 motifs. Slot-filled templates are
  the correct tool.
- **Piece activity heatmaps**: insufficient signal per game at sub-1600; only meaningful
  aggregated over 100+ games.
- **Position-feature regression to predict strategic concept**: this requires a training
  corpus and drifts into ML. Rule-based detectors cover 80% of sub-1600 mistakes.
- **Win% trajectory text annotations**: the win% chart is already present. Overlaying prose
  on it adds noise for the target population.

---

## References

- Chase, W.G. & Simon, H.A. (1973). Perception in chess. *Cognitive Psychology*, 4(1), 55–81.
- Charness, N., Tuffiash, M., Krampe, R., Reingold, E., & Vasyukova, E. (2005). The role of
  deliberate practice in chess expertise. *Applied Cognitive Psychology*, 19(2), 151–165.
- de Groot, A. (1946/1965). *Thought and Choice in Chess*. Mouton.
- Gobet, F. & Charness, N. (2006). Chess and games. In K.A. Ericsson et al. (Eds.),
  *Cambridge Handbook of Expertise and Expert Performance*. Cambridge UP.
- Guid, M. & Bratko, I. (2006). Computer analysis of world chess champions.
  *ICGA Journal*, 29(2), 65–73.
- Hattie, J. & Timperley, H. (2007). The power of feedback. *Review of Educational
  Research*, 77(1), 81–112.
- Kulhavy, R.W. & Stock, W.A. (1989). Feedback in written instruction. *Educational
  Psychology Review*, 1(4), 279–308.
- Reiter, E. & Dale, R. (2000). *Building Natural Language Generation Systems*. Cambridge UP.
- Shute, V.J. (2008). Focus on formative feedback. *Review of Educational Research*,
  78(1), 153–189.
- Silman, J. (2010). *How to Reassess Your Chess* (4th ed.). Siles Press.
- Sripada, S., Reiter, E., Hunter, J., & Yu, J. (2003). Generating English summaries of time
  series data using the SUMTIME system. *Proc. KDD 2003*, 187–196.
- Sweller, J. (1988). Cognitive load during problem solving. *Cognitive Science*, 12(2),
  257–285.
- Lichess puzzler tactic detector (open source):
  github.com/lichess-org/lichess-puzzler — `tagger/cook.py`
