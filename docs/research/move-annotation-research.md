# Move Annotation Research: Industry Standards and pawnbook's Current Flaws

**Date:** 2026-09-01  
**Status:** Findings — informs redesign of `src/shared/quality.js` and `src/domain/analysis/grade.js`

---

## 1. Industry Standard Summary

The two dominant chess platforms — Chess.com and Lichess — take fundamentally different approaches:

| Aspect | Chess.com | Lichess |
|---|---|---|
| Positive glyphs in move list | Yes — all seven tiers shown inline | **No** — only `??`, `?`, `?!` shown |
| Win% model | Expected Points (EP, 0–1 scale, rating-adjusted) | WinningChances (−1..+1, sigmoid on cp) |
| Thresholds | EP-drop based, not cp-based for main tiers | Winning-chances delta, 3 thresholds only |
| Brilliant (!!) | **Piece sacrifice** + nearly best move + not already winning | Not natively supported (third-party plugins add it) |
| cp used for classification | Only for "Book" detection | Only for mate-sequence edge cases |
| Opening moves | Classified as "Book" (separate tier) | Treated as normal moves |

**Key insight:** Lichess deliberately shows **only negative annotations** in the game analysis move list. This is a design choice, not a limitation. The chess engine easily identifies bad moves (deviation from best causes measurable win% loss), but it cannot reliably identify *exceptional* moves because most "best" moves are simply the logical continuation, not something surprising or difficult.

---

## 2. Chess.com: Full Annotation Taxonomy

### Classification model (Classification V2, as of late 2022)

Chess.com uses an **Expected Points (EP)** model. EP represents the player's probability of winning (0.00–1.00), computed from engine eval adjusted by the player's rating. Rating-adjustment means a 1600-rated player in a +2.0 position has lower EP than a 2400-rated player in the same position, because the higher-rated player is more likely to convert it.

**EP-drop thresholds:**

| Classification | EP lost (lower) | EP lost (upper) | Glyph |
|---|---|---|---|
| Best | 0.00 | 0.00 | (none / cyan highlight) |
| Excellent | 0.00 | 0.02 | (none) |
| Good | 0.02 | 0.05 | (none) |
| Inaccuracy | 0.05 | 0.10 | `?!` |
| Mistake | 0.10 | 0.20 | `?` |
| Blunder | 0.20 | 1.00 | `??` |

**Special tiers (rules beyond EP):**

| Classification | Criteria |
|---|---|
| **Brilliant (!!)** | Must be a **good piece sacrifice** (you give up material that can be captured). Additionally: move must be best or nearly best; position must not be bad after the move; you must not have been completely winning before it. More generous for lower-rated players. This is explicitly **not** awarded for cpLoss=0 alone. |
| **Great Move (!)** | Critical turning-point move — turns a losing position to equal, or equal to winning, or is the only reasonable move in a losing position. More generous for lower-rated players. |
| **Miss** | Failed to capitalise on opponent's mistake; missed a chance to enter a winning position. Rating-adjusted thresholds for what "winning" means. |
| **Book** | Conventional opening move (from opening tree). |
| **Forced** | Only legal move (or only non-losing move in a completely lost position). |

**Display in move list:**  
Chess.com shows a colored icon next to every annotated move, inline with the SAN. The icons use distinct colors per tier: cyan (Brilliant), green (Great/Best), light green (Excellent/Good), yellow (Book), orange (Inaccuracy), red (Mistake), dark red (Blunder). The move number, white move+icon, black move+icon are laid out in a 3-column table with the icon as a small badge appended after the SAN text.

### Key observation
Even Chess.com does **not** show `!!` or `!` for simply "best" or "excellent" moves. Those tiers get a color highlight only, with no glyph symbol. The `!!` and `!` glyphs are reserved for Brilliant and Great, which require exceptional conditions beyond just low cp loss.

---

## 3. Lichess: Classification Thresholds

### Source: `modules/tree/src/main/Advice.scala` (verified from GitHub)

Lichess uses **winningChances delta** (not cp directly):

```scala
private val winningChanceJudgements = List(
  .3 -> Judgement.Blunder,      // losing 30+ pp of winning chances
  .2 -> Judgement.Mistake,      // losing 20–30 pp
  .1 -> Judgement.Inaccuracy    // losing 10–20 pp
)
```

Where `winningChances(cp) = 2 / (1 + exp(-0.00368208 * cp)) - 1` (identical formula to pawnbook's).

Mate sequences have additional rules:
- Creating a forced mate from a lost position (< −700cp) → Inaccuracy
- Creating a forced mate from a bad position (< −700cp but > −999cp) → Mistake  
- Missing a forced mate → Blunder or Mistake depending on eval

**Crucially: Lichess defines exactly 3 classification tiers** — Inaccuracy, Mistake, Blunder. There is no `ok`, `good`, `great`, or `best` tier at all. Moves that don't meet the Inaccuracy threshold receive **no annotation whatsoever**.

### Display in move list
Lichess shows `?!`, `?`, `??` as superscript glyphs after the SAN text in the move replay column. Moves without annotation have no badge, no color, no icon. The move list is consistent: the SAN text is in a fixed-width column and the annotation (if any) appears inline to the right. The layout never shifts because absent annotations produce no element at all.

---

## 4. Classical NAG Definitions (PGN Standard)

The Numeric Annotation Glyph (NAG) standard (FIDE/USCF) defines:

| Symbol | NAG | Classical meaning |
|---|---|---|
| `!` | $1 | Good move |
| `?` | $2 | Poor move |
| `!!` | $3 | **Excellent/brilliant move** — typically a sacrifice, surprise, or counterintuitive best move |
| `??` | $4 | Blunder |
| `!?` | $5 | Interesting/speculative move |
| `?!` | $6 | Dubious/questionable move |

In **human annotation** (grandmaster game books), `!!` is extremely rare — awarded perhaps once per tournament game, if at all. It means the human annotator found the move surprising, deep, or instructive in some way. `!` is awarded for good moves in critical positions, not for routine best moves.

The crucial distinction: **classical NAG symbols are editorial, not mechanical.** No engine assigns `!!` to a move just because cpLoss=0. That conflation is pawnbook's core error.

---

## 5. pawnbook's Current Implementation: What Is Wrong

### Flaw 1: `!!` and `!` awarded mechanically on cpLoss thresholds

In `src/domain/analysis/grade.js`:

```js
if (cpLoss === 0) return { classification: 'best' };     // !! glyph
if (cpLoss < 25)  return { classification: 'great' };   // ! glyph
if (cpLoss < 50)  return { classification: 'good' };    // no glyph
return { classification: 'ok' };                         // no glyph
```

With depth-18 Stockfish analysis, `cpLoss === 0` for every move that matches the engine's top choice at that depth. This is the **majority of moves** in the opening and early middlegame, where many reasonable developing moves evaluate as equal. The result is a move list dominated by `!!` and `!` annotations — which is exactly what the user observed.

**This is fundamentally wrong.** `cpLoss === 0` means "the engine prefers this move equally or better at depth 18." It does not mean the move was brilliant or difficult to find. e4, Nf3, O-O are all `cpLoss=0` in most positions but are trivial moves.

### Flaw 2: `!` (`great`) is awarded for cpLoss < 25

Depth-18 evaluation noise for reasonable moves is easily ±20–30cp. A move with cpLoss=15 is not meaningfully different from cpLoss=0 at this depth. Awarding `!` for cpLoss<25 means any reasonable move that is almost-best gets a positive glyph.

### Flaw 3: Win% thresholds for negative tiers are correct but create an asymmetry

The win% thresholds for blunder/mistake/inaccuracy (30/20/10 pp) match Lichess exactly. These are sound. But there is no symmetry justification for awarding positive glyphs at the cp tier — the "good" tiers were added as mirror images of negative tiers without the same statistical justification.

### Flaw 4: Display layout creates zig-zag

Because the glyph chip is inserted inline after the SAN text with no fixed column, the two move cells in each row have variable widths. A row with an annotated white move and no black annotation looks different from a row with no annotations. The black column shifts left/right depending on white's chip.

### Flaw 5: No concept of "Book" (opening moves)

All moves get classified — including trivial opening-theory moves. e4 is `best`, Nf3 is `best`. These are book moves and should either be classified as "Book" or receive no annotation.

---

## 6. Recommended Improvements

### Immediate (already partially applied):

**R1 — Remove `!` and `!!` glyphs entirely from the move list.**  
Set `glyph: null` for `great` and `best` in `quality.js`. The quality breakdown bar and table can still show the labels. This matches Lichess's approach.

**R2 — Fix move list layout.**  
Each move cell should use `display: grid; grid-template-columns: 1fr 20px` so the glyph slot is always a fixed 20px column, whether or not a glyph is present. This eliminates zig-zag.

### Medium-term:

**R3 — Drop `great` and `best` from sub-inaccuracy classification entirely.**  
Lichess uses only 3 negative tiers. pawnbook should do the same. Moves below the inaccuracy threshold get no classification (or `ok`). The 7-tier system is overcomplicated and misleading.

Proposed simplified `classify()`:

```js
export function classify(winLoss, cpLoss, opts = {}) {
  // ... mate handling unchanged ...
  if (winLoss >= BLUNDER_WIN_PTS)    return { classification: 'blunder' };
  if (winLoss >= MISTAKE_WIN_PTS)    return { classification: 'mistake' };
  if (winLoss >= INACCURACY_WIN_PTS) return { classification: 'inaccuracy' };
  return { classification: 'ok' };  // no glyph, no annotation
}
// Remove GREAT_CP_MAX, GOOD_CP_MAX from balance.js
```

**R4 — Add a "Book" tier for opening moves.**  
Moves at ply ≤ 20 (or until the first non-book deviation) that match a known opening tree can be classified as `book`. This prevents opening moves from being annotated with `ok` when they're well-known theory.

**R5 — Reserve `!!` for genuine findability-based brilliancy.**  
If `!!` is to be used at all, it should require:
1. `cpLoss === 0` (best move)
2. Maia findability < 0.15 (hard to find — top 15% of moves by human-like probability)
3. Win% improvement ≥ 5 pp (position materially better after the move)
4. Position was not already completely winning (ep ≤ 0.85)

This would make `!!` genuinely rare and meaningful. pawnbook already has Maia findability data available through the analysis pipeline.

### Threshold comparison table

| Tier | Lichess (win% delta) | Chess.com (EP drop) | pawnbook current | pawnbook recommended |
|---|---|---|---|---|
| Blunder `??` | ≥ 0.30 | ≥ 0.20 | ≥ 30 pp | ≥ 30 pp (keep) |
| Mistake `?` | 0.20–0.30 | 0.10–0.20 | 20–30 pp | 20–30 pp (keep) |
| Inaccuracy `?!` | 0.10–0.20 | 0.05–0.10 | 10–20 pp | 10–20 pp (keep) |
| OK (no glyph) | < 0.10 | < 0.05 | cp-based sub-tiers | < 10 pp (simplify) |
| Great `!` | — | Turn-point only | cpLoss < 25 | **Remove** |
| Brilliant `!!` | — | Piece sacrifice | cpLoss = 0 | Findability gate only |

---

## References

- Chess.com support: [How are moves classified?](https://support.chess.com/en/articles/8572705-what-are-the-computer-analysis-symbols-on-chess-com)
- Chess.com support: [How does Game Review work?](https://support.chess.com/en/articles/8584089-how-does-game-review-work)
- Lichess source: [`modules/tree/src/main/Advice.scala`](https://github.com/lichess-org/lila/blob/master/modules/tree/src/main/Advice.scala)
- PGN/NAG standard: ChessDB NAG values list, SCID NAG values
- Chess Stack Exchange: [Why does Lichess only show inaccuracies, mistakes, and blunders?](https://chess.stackexchange.com/questions/24378/)
