# Progression and pacing

## No XP, no levels, no unlocks

Chess supplies its own progression. A parallel artificial one would compete with it. The only progression currencies are rating, retired puzzles, and streak.

## Cold start

A new install has no rating, no puzzles, and nothing to drill. Designed opening:

1. **First-run screen** states the loop in one screen — play, get analysed, drill your mistakes. Not a tutorial. One screen with the four steps and a Play button.
2. **Calibration.** Default 1200 with `K_PROVISIONAL = 40` for 15 games. The UI labels it `provisional` until convergence. Opponent picker starts at Maia-1300.
3. **The first analysis is the demo.** Analysis runs behind the result card with a real progress bar. Play vs Maia first — human-shaped mistakes produce more interesting review content than a handicapped Stockfish's alien ones.
4. **Do not gate drill behind volume.** 2 puzzles from one game is a valid first batch.

## Queue economy

- `DUE_SOFT_CAP = 40`: above this, badge shows `40+`, batches prioritise by `instructiveness × overdue`
- FSRS state is never discarded — only presentation is capped
- **Graduation** (`reps >= 5`, no lapses, `interval > 180d`) removes a card from the active queue. This is a reward: "you have retired 112 mistakes" is the most motivating number the system can honestly produce
- **Empty queue** is a win state: "Nothing due — you're clear. Play a game or drill ahead."

## Starvation

The opposite of flood. An empty queue is phrased as an achievement, and the dashboard offers Play or drill-ahead as the next action.

## Farming

Beating Maia-1100 at 1400 gains `K × 0.15 ≈ 3 points per win` and produces few useful puzzles. The design makes the good choice easy rather than policing the bad one: the picker highlights near-rating opponents, marks ±150 as *Even match*, and the dashboard's Play button names a suggestion.
