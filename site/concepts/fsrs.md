---
title: FSRS Scheduling
---

# FSRS Scheduling

pawnbook uses FSRS (Free Spaced Repetition Scheduler) to schedule puzzle reviews. The algorithm shows you each card just before you would forget it, maximising long-term retention with minimal daily review time.

## How it works

FSRS models memory with two parameters: stability (how long you can retain the material) and difficulty (how hard this card is for you). After each review, both parameters are updated based on your performance.

The scheduler targets **90% retention** — each card is shown again when your estimated recall probability has dropped to 90%.

## The four ratings

Every FSRS review produces one of four outcomes: Again, Hard, Good, Easy. In pawnbook you never choose these — the server infers the rating from your response.

| Condition | Rating |
|---|---|
| Wrong answer, or hint used | Again |
| Correct, took > 25 seconds | Hard |
| Correct, took ≤ 25 seconds | Good |
| Correct, took < 6 seconds, first attempt | Easy |

A rating of **Again** resets the card's stability to near zero — it will be shown again soon. **Easy** significantly extends the next interval.

### Followup moves

Some puzzles require a two-ply sequence: you must play the correct first move and then the correct response to the engine's reply. The rating for the full attempt:

- Wrong followup (first move was correct) → **Hard** (never Again or Easy)
- The Easy window runs from the start of the attempt to the completion of the followup, not just the first move

### Suspect recall

If you answer correctly in under 2 seconds on your first *spaced* review (not the initial quiz or drill after the game), the card is flagged as `suspect_recall`. You may have memorised the board position rather than genuinely learned the concept. The flag is visible in the review; the card is not removed from the queue.

## Card kinds

| Kind | Source | Findability gate |
|---|---|---|
| `tactics` | Game mistakes (blunder/mistake/inaccuracy) | Required: findability ≥ 0.04 |
| `opening` | Confirmed canonical repertoire nodes | Exempt — always drilled |

Opening cards are created when a repertoire node reaches the `canonical` role. They test whether you can recall your book move from a given position.

## Card lifecycle

1. **Created**: after analysis (tactics) or when a repertoire node is confirmed (opening)
2. **First due**: tomorrow
3. **Review**: each correct review extends the interval; each lapse (Again) resets it
4. **Graduated**: ≥ 5 reviews, no lapses, scheduled interval > 180 days — no longer served in the regular drill queue, counted in the graduated stat

## Queue management

The drill queue has a **soft cap of 40 due cards**. Below the cap, cards are sorted by due date (oldest first). Above the cap, the sort changes:

1. Opening cards first, sorted by reach probability (most-reached positions drilled first)
2. Then tactical cards, sorted by `instructiveness × overdue factor`

The daily drill batch is **10 cards**. The practice mode (`/api/puzzles/practice`) serves not-yet-due cards for drill-ahead, sorted by instructiveness.

## Post-game quiz

After a game, the mistakes from that game are presented as an immediate quiz (`/api/games/:id/quiz`). This is a practice session, not a scheduled FSRS review:
- Cards are created with `due = tomorrow` if they don't exist yet
- No FSRS scheduling algorithm runs (stability/difficulty not updated)
- The purpose is immediate reinforcement, not spaced repetition

Spaced repetition begins the following day when the card enters the regular drill queue.
