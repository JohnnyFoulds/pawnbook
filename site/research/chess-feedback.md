---
title: Chess Feedback Without an LLM
---

# Chess Feedback Without an LLM

**Status**: Research note — implemented in Phases 19a–19d  
**Context**: pawnbook previously surfaced `cpLoss` and `winLoss` on puzzle cards with no prose explanation. This is opaque to players under roughly 1600. This note surveys the academic and technical literature on how to provide meaningful, human-readable feedback using only deterministic computation — no LLM, no network call, runs offline.

The full research document is at [`docs/research/chess-feedback-without-llm.md`](https://github.com/JohnnyFoulds/pawnbook/blob/master/docs/research/chess-feedback-without-llm.md) in the repository.

---

## Key findings

### What chess pedagogy says

De Groot (1946) and Chase & Simon (1973) established that chess skill is primarily *pattern library size*, not calculation depth. Players under ~1600 have small chunk libraries — they don't recognise danger in a position until after it materialises.

**The direct implication**: abstract evaluation numbers are useless to sub-1600 players; named patterns are not. A player who sees "blunder — cpLoss 84" learns nothing they can carry forward. A player who reads "hanging piece" has a label they can apply to the next game.

Charness et al. (2005) found that the highest-gain activity for improving players is tactic-puzzle practice specifically targeted at a known weakness *category*. The most valuable feedback unit is not "what went wrong in this position" but "which category of cognitive error produced this mistake," because that drives the right future drilling.

### What feedback science says

Shute (2008) identified a hierarchy in 30+ years of feedback research:

| Feedback type | Effect |
|---|---|
| Verification only ("wrong") | Minimal, sometimes negative |
| Knowledge of correct response ("the right move was Rd1") | Moderate |
| Elaborated / response-specific ("Rd1 because your queen was overloaded") | Strongest |

Hattie & Timperley (2007) identify *process feedback* — naming which cognitive pattern broke down — as the most neglected and most valuable level for learning.

### The available taxonomy

The Lichess puzzler tagger (`lichess-org/lichess-puzzler`, `tagger/cook.py`) implements purely rule-based tactic detection over the board representation: fork, skewer, pin, discovered attack, hanging piece, trapped piece, and more. All are boolean functions over board state — no ML. This is the directly portable prior art.

---

## What was implemented

The research recommendation was a three-phase implementation sequence:

### Phase 19a — Best-move arrow

After a second wrong attempt, a green arrow is drawn on the board showing exactly which move was correct. Requires no new data; uses `bestMoveUci` already on the puzzle card and the cm-chessboard Arrows extension.

### Phase 19b — Threat explanation

A one-sentence description of *why* the played move was bad, computed deterministically from the FEN using chess.js:

- If the moved piece ends on an attacked, undefended square: *"The knight moved to g5 has no safe square — the opponent can capture it."*
- If a different player piece is left hanging: *"Moving the bishop away from c3 left the queen on d4 undefended."*

No engine call. Runs in < 1 ms in the browser.

### Phase 19c — Motif classifier

`classifyMotif(fen, playedMoveUci, sideToMove)` in `src/domain/analysis/motif-classifier.js` inspects board state after the played move and returns a named tag:

| Tag | Detection |
|---|---|
| `hanging_piece` | A player piece is attacked and has zero defenders after the move |
| `fork` | A single opponent piece (non-king) attacks 2+ player pieces worth ≥ a knight |
| `null` | No detectable motif |

Tags are stored in `puzzles.motif_tag` at analysis time and returned on every puzzle card payload.

### Phase 19d — Skill-dimension aggregation

The Stats page now shows a **Top weakness** card when tagged mistakes exist:

> *"7 of your last 12 mistakes were hanging-piece errors. Keep an eye on these in your drill queue."*

The card includes a bar chart of all motif counts and respects the 30d/90d/All time filter. This directly implements the Charness et al. deliberate-practice prescription: identify the error category, then target it with drilling.

---

## What was deliberately not built

- **Full NLG pipeline**: Reiter & Dale is overkill for the current motif set. Slot-filled templates cover the cases that exist.
- **Piece activity heatmaps**: insufficient signal per game at sub-1600; only meaningful aggregated over 100+ games.
- **Position-feature regression to predict strategic concept**: requires a training corpus and drifts into ML. Rule-based detectors cover 80% of sub-1600 mistakes.

---

## References

- Charness et al. (2005). The role of deliberate practice in chess expertise. *Applied Cognitive Psychology*, 19(2), 151–165.
- Chase & Simon (1973). Perception in chess. *Cognitive Psychology*, 4(1), 55–81.
- de Groot (1946/1965). *Thought and Choice in Chess*. Mouton.
- Hattie & Timperley (2007). The power of feedback. *Review of Educational Research*, 77(1), 81–112.
- Shute (2008). Focus on formative feedback. *Review of Educational Research*, 78(1), 153–189.
- Lichess puzzler tactic detector: github.com/lichess-org/lichess-puzzler
