---
title: The Drill System
---

# The Drill System

pawnbook uses FSRS (Free Spaced Repetition Scheduler) to schedule puzzle practice. Cards that you struggle with appear more frequently; cards you recall reliably are shown less often. The target retention rate is 90%.

---

## You never rate yourself

Unlike Anki, you do not choose a rating button after solving a puzzle. The server infers your rating from observable behaviour: response time, correctness, and hint usage.

| Behaviour | Rating | Effect |
|---|---|---|
| Wrong move | **Again** | Card interval resets to near-zero |
| Hint used | **Again** | Card interval resets to near-zero |
| Correct, > 25 seconds | **Hard** | Shorter interval than normal |
| Correct, <= 25 seconds | **Good** | Standard scheduled interval |
| Correct, < 6 seconds, first try | **Easy** | Longer interval |

These thresholds apply to each attempt. A correct move after a failed first attempt always scores **Again**, regardless of time.

---

## Followup moves

Some puzzles require a two-ply response: the best move, then a follow-up to your opponent's reply.

- Getting the first move right but the followup wrong scores **Hard** (not Again or Easy)
- The Easy threshold (< 6 seconds) is measured to the end of the full sequence, not just the first move
- The followup requirement is noted on the card before you solve it

---

## suspect_recall

If you answer correctly in under 2 seconds on your first **spaced** review (after the initial learning period), the card is flagged as `suspect_recall`. This may indicate position memorisation rather than pattern recognition.

Flagged cards are not penalised — they continue on their normal schedule — but the flag is visible on the review statistics screen.

---

## The queue

**Due cards** are shown first. Within the due queue, cards are sorted by instructiveness (win-percentage loss × findability) multiplied by the overdue factor. A highly instructive card that is overdue by 5 days ranks above a marginal card that is overdue by 1 day.

**Practice cards** (not yet due) are available separately on the Drill screen under "Practice". Drilling practice cards does not change their scheduled due date.

**Soft cap at 40**: when more than 40 cards are due, the queue behaviour changes:
- **Opening cards** (repertoire positions) are served first
- **Tactical cards** (from game mistakes) fill the remaining slots, sorted by the same instructiveness factor

Opening cards benefit more from same-day repetition because the positions appear in your actual games frequently. The cap prevents the queue from becoming overwhelming after a long break.

---

## Card types

| Kind | Source | Findability gate |
|---|---|---|
| `tactics` | Game mistakes (blunder, mistake, inaccuracy) | Must be >= 0.04 to enter queue |
| `opening` | Repertoire canonical positions | Exempt — always drilled |

Opening cards are exempt from the findability gate because book positions need to be drilled regardless of how findable the best move is.

---

## Graduation

A card graduates when all three conditions are met:

1. At least 5 completed reviews
2. Zero lapses (no Again ratings)
3. Scheduled interval > 180 days

Graduated cards are removed from the drill queue. They have been learned. The **Stats** page counts graduated cards separately.

The empty drill queue — every card graduated or not yet due — is the win state. It means all drillable history has been learned or is on a long schedule.

---

## Post-game quiz vs drill

After a game, the **Quiz** button opens immediate practice on the mistakes from that specific game.

Quiz mode differs from drill mode:

- Quiz cards are **not** scheduled by FSRS immediately
- A card with `due = tomorrow` is created for each quiz position
- The cards enter the normal drill queue from the next day
- Quiz performance does not affect existing card schedules

Quiz is intended for immediate review while the game is fresh. The FSRS scheduling for those positions begins on the first drill-screen session.

---

## Navigating the drill screen

The drill screen shows one position at a time. Click (or tap) a piece and destination to submit a move. The board is interactive.

After submitting:

- **Correct**: the next position loads after a short confirmation flash.
- **Wrong on first attempt**: one retry is given. The position stays on screen and the feedback banner says "Not the best — one more try."
- **Wrong on second attempt**: three pieces of feedback are shown simultaneously:
  1. **Best-move arrow** — a green arrow drawn directly on the board shows exactly which move was correct and where it lands.
  2. **Threat explanation** — if a tactical threat is detectable (a piece left hanging, a fork created), a one-sentence description appears: *"Moving the knight away from f3 left the queen on d1 undefended."* Computed locally from the position — no engine call.
  3. **Motif tag** — each mistake is classified as a named error type (`hanging_piece`, `fork`, etc.) and stored with the card. The tag drives the **Top weakness** tile on the Stats page.

The due count in the header decrements as you complete cards. When the queue empties, the screen shows the empty state.
