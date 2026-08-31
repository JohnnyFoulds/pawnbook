---
title: Analysis Pipeline
---

# Analysis Pipeline

After every completed game, pawnbook runs a three-pass analysis pipeline. The result is a win-probability curve for every position, move classifications, puzzle candidates with findability scores, and a playing-strength Elo estimate.

## Incremental pre-evaluation

Analysis does not start when the game ends — it starts during play.

After each accepted player move, a depth-20 Stockfish evaluation is queued in the background. This is the **pre-eval** pass. When the post-game pipeline runs, it checks `move_evals` for existing rows and skips any position already evaluated. For a typical 40-move game, most positions are pre-evaluated before the game ends.

Pre-eval details:
- Default depth: 20
- Catch-up mode: if the queue depth exceeds `INCREMENTAL_MAX_QUEUE` (5), depth drops to 18 so the queue drains before the next move arrives
- Engine config: Threads=1, Hash=16 MB (minimal footprint during live play)
- Storage: `move_evals` table, same schema as analysis results

Effect on analysis time: a 40-move game with a warm pre-eval cache completes post-game analysis in roughly 70 seconds. Cold (no cache): up to 4 minutes.

## Pass 1 — full-game evaluation

**Time budget**: ≤ 2.0 s/position; approximately 76% of total analysis time

Pass 1 evaluates every N+1 position in the game at depth 18. Positions already in `move_evals` are skipped.

Output per position:
- `cp_white`: centipawns from White's perspective
- `win_pct`: win probability for the side to move
- `legal_move_count`: number of legal moves (used to filter forced-move positions for strength estimation)

Engine config: Threads=4, Hash=512 MB. For computationally expensive positions: Threads=6, Hash=1024 MB.

## Pass 2 — candidate analysis

**Time budget**: ≤ 7.0 s/candidate; approximately 22% of total analysis time

Pass 2 re-evaluates candidate mistakes — positions where the player played a blunder, mistake, or inaccuracy — at depth 22 with MultiPV 3. This finds alternative moves the player could have played.

Output:
- `alt_moves_json`: moves within `NEAR_MISS_WIN_PTS` of the engine best move, with win% loss values
- Updated `bestmove` at higher depth

This data powers the "you could also have played X" display in the review page.

## Pass 3 — Maia policy probes

**Time budget**: ≤ 0.5 s/position; approximately 2% of total analysis time

Pass 3 runs Maia policy queries on each puzzle candidate. It measures how likely a human player would be to find the correct move.

| Value | Definition |
|---|---|
| `findability` | P_maia(Stockfish best move) |
| `temptation` | P_maia(played move) |

`instructiveness = win_loss_pts × findability` — the primary sort key for the drill queue.

**Puzzle gate**: if `findability < 0.04`, the puzzle is tagged `engine_only`. It appears in the review page but is not added to the drill queue.

**Fallback**: if Maia policy output is unparseable, findability defaults to 1.0 and temptation to 0.25, with a warning log entry.

## WebSocket progress events

During analysis, `analysis_progress` messages report progress (phase, done, total, overallPct). When analysis completes, a second `game_over` message carries the Elo update. The initial `game_over` at game end has null Elo values — the update requires completed analysis.

## Error handling

If analysis fails:
- The game is marked `analysis_state = 'failed'`
- `POST /api/games/:id/analyse` re-triggers analysis
- `GET /api/games/:id/review` includes `analysisState` and `analysisError`

## Performance summary

| Scenario | Time |
|---|---|
| 40-move game, warm pre-eval cache | ~70 s |
| 40-move game, cold (no pre-evals) | ≤ 4 min |
| Per-position pass 1 | ≤ 2.0 s |
| Per-candidate pass 2 | ≤ 7.0 s |
| Per-candidate pass 3 | ≤ 0.5 s |
