---
title: The Repertoire Coach
---

# The Repertoire Coach

pawnbook silently records every opening move you play and builds a personalised book from your own games. No databases, no imported PGNs, no manual curation required.

---

## How the book builds

Every move you play in the opening (within the first 30 plies) is recorded as an observation tied to the exact board position (EPD key, position-identity rather than move sequence — transpositions are handled correctly).

After **2 observations** of the same move in the same position, the move is confirmed. Confirmed moves are evaluated against four soundness gates. Moves that pass the gates are admitted to the book.

The evaluation uses Stockfish depth-22 analysis. This runs asynchronously after each game; it does not affect game performance.

---

## Move roles

Each move in each position has one of seven roles:

| Role | Meaning |
|---|---|
| `candidate` | Seen at least once, not yet confirmed (< 2 observations) |
| `canonical` | Your confirmed primary move for this position |
| `alt` | A confirmed acceptable alternative |
| `challenger` | Your preferred move when it conflicts with the canonical |
| `quarantined` | Confirmed but costs 10–20 win% — tracked for research, not coached |
| `refused` | Too costly, forced mate, or below the absolute floor |
| `retired` | Previously active, no longer used |

---

## The four soundness gates

Confirmed moves are evaluated against four gates. A move that fails any gate is **refused** or **quarantined**:

1. **Forced mate** — if the position contains a forced mate, the move is refused
2. **Win% loss >= 20 points** — the move costs 20 or more win-percentage points compared to the best available move; refused as unsound
3. **Absolute floor** — win% after the move falls below 35% when the best available move can reach 35%; refused
4. **Cumulative line budget** — the total win% loss accumulated along the entire line from the starting position reaches 20 points; refused

Moves that cost 10–19 win% (below the unsound threshold but above the admission threshold) are **quarantined**: recorded and tracked, but not coached and not used in the canonical selection.

---

## Coach bootstrap

The coach is silent until you have **20 or more confirmed canonical nodes**. Before this threshold is reached, no alerts fire even if coach is toggled on.

This prevents the coach from alerting on an under-populated book where the canonical choices may not yet be representative of your actual preferences.

---

## Alert kinds

When the coach fires, it classifies the deviation:

| Kind | Meaning |
|---|---|
| `order_slip` | A known book move played in the wrong order within a line |
| `lapse` | A refused move played again |
| `refused_repeat` | A move that has been evaluated as unsound |
| `novelty` | A move not yet in the book, played in a covered position |

Only `order_slip`, `lapse`, `refused_repeat`, and `novelty` trigger alerts. Moves that are simply off-book in positions the book does not cover are not alerted.

---

## Keep vs correct

When alerted, you have **60 seconds** to decide:

**Correct** — the board plays the book move instead. Your move is discarded. The game continues from the book position.

**Keep** — your move is accepted. A **challenge** is opened for later automated review.

**Timeout** (no response in 60 seconds) — your original move is applied automatically. No challenge is opened.

The game becomes unranked as soon as the first alert fires. Maximum 3 alerts per game.

---

## Challenges

A challenge is an open question: is your kept move better than the book canonical?

The system resolves challenges automatically using a 9-rule decision process (first matching rule wins):

| Rule | Condition | Outcome |
|---|---|---|
| 1 | Gate veto — move fails a soundness gate | Rejected (unsound) |
| 2 | Engine-clear — your move is > 2 win% better | Promoted to canonical |
| 3 | Repeat + engine neutral — you've played it multiple times, engine within tolerance | Promoted |
| 4 | Trend/result evidence — game results support your move within engine tolerance | Promoted |
| 5 | Style-call — gates pass, results support your move even if engine dislikes it | Promoted |
| 6 | Incumbent wins — plays and results favour the canonical | Rejected |
| 7 | TTL expiry — 8 encounters without resolution | Abandoned |
| 8 | Alternation — both moves have >= 3 recent plays | Both become canonical + alt |
| 9 | Still open | — |

Challenges are displayed on the **Repertoire** page under the Challenges panel.

---

## Reversing a promotion

On the **Changelog** tab of the Repertoire page, each `promote` and `settle` entry has a **Reverse** button.

Reversing a promotion:
- Restores the previous canonical move
- Suppresses the challenger for several encounters (it will not be re-evaluated immediately)
- Writes a `reverse` entry to the changelog

This is useful if the automated promotion produced a book move you disagree with.

---

## Coverage and gaps

**Coverage** (shown at the top of the Repertoire page) is the percentage of reachable positions that have a canonical move.

Reach probability is estimated by running Maia policy probes from the starting position via BFS: the probability of reaching each position is the product of move probabilities along the path. Because your opponents are Maia models, this calibration is exact — the reach probability predicts actual encounter frequency.

The **Gap report** lists positions that have high reach probability (your opponents frequently play into them) but no canonical coverage. These are the positions most worth playing into to generate new observations.

---

## Opening drill cards

Every canonical book position gets an FSRS drill card. Opening cards are:
- Exempt from the findability gate (they are always drilled, regardless of how findable the best move is)
- Prioritised above tactical cards when the due queue exceeds the soft cap

Opening cards represent positions you will actually face. Drilling them reinforces the book positions that the coach will later coach.

---

## Journey timeline

The **Journey** tab on the Repertoire page shows:
- A chronological timeline of book changes (promotions, refusals, reversals, milestones)
- A growth curve showing canonical node count over time
- Milestones (first canonical node, first challenge, first promotion, coverage thresholds)
