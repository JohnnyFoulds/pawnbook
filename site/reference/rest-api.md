---
title: REST API
---

# REST API

All endpoints are served under `/api/`. The server listens on `http://localhost:3000` by default.

---

## GET /api/state

Lightweight dashboard state and Docker healthcheck endpoint.

**Response**

| Field | Type | Description |
|---|---|---|
| `status` | `'ok'` | Healthcheck indicator |
| `elo` | integer | Current player Elo rating |
| `eloDelta` | integer | Elo change over last 10 ranked games |
| `eloHistory` | array | Historical Elo data points for charting |
| `dueCount` | integer | Number of FSRS cards currently due |
| `showStreak` | boolean | Whether the streak display is enabled in settings |
| `streak` | integer | Current day-streak (days with any activity) |
| `bestStreak` | integer | Longest ever consecutive day-streak |
| `todayDrills` | object | `{attempted, correct}` first-attempt non-practice reviews today (04:00 boundary) |
| `activityHistory` | array | `[{day, games, reviews}]` last 30 days of activity |
| `gamesPlayed` | integer | Total lifetime games played |
| `recentGames` | array | Up to 8 most recent games |
| `suggestedOpponent` | string \| null | Opponent ID suggested based on current Elo |
| `inProgressGameId` | string \| null | UUID of any unfinished game |
| `inProgressOpponentId` | string \| null | Opponent ID of the in-progress game |

Each `recentGames` item:

| Field | Type | Description |
|---|---|---|
| `id` | string | Game UUID |
| `opponentId` | string | Opponent identifier |
| `result` | `'win'` \| `'loss'` \| `'draw'` | Game result from the player's perspective |
| `accuracy` | number | Player accuracy (1–100) |
| `puzzleCount` | integer | Drillable puzzles extracted |
| `playedAt` | string | ISO 8601 timestamp |

**Example response**

```json
{
  "status": "ok",
  "elo": 1432,
  "eloDelta": 12,
  "eloHistory": [1200, 1240, 1315, 1390, 1432],
  "dueCount": 7,
  "showStreak": true,
  "streak": 5,
  "gamesPlayed": 34,
  "recentGames": [
    {
      "id": "a1b2c3d4-...",
      "opponentId": "maia-1400",
      "result": "win",
      "accuracy": 74.3,
      "puzzleCount": 3,
      "playedAt": "2026-08-31T09:12:00.000Z"
    }
  ],
  "suggestedOpponent": "maia-1500",
  "inProgressGameId": null,
  "inProgressOpponentId": null,
  "bestStreak": 12,
  "todayDrills": { "attempted": 10, "correct": 8 },
  "activityHistory": [{ "day": "2026-08-30", "games": 1, "reviews": 10 }]
}
```

---

## GET /api/opponents

Returns all available engine opponents — filtered to only those whose binary and weight files exist on disk at startup.

**Response**

```json
{
  "opponents": [
    {
      "id": "maia-1100",
      "name": "Maia 1100",
      "elo": 1100,
      "type": "maia3",
      "available": true
    }
  ]
}
```

Each opponent object includes `id`, `name`, `elo` (target strength), `type` (`maia3`, `maia`, or `stockfish`), and `available` (boolean).

---

## GET /api/games

Returns the 50 most recent games, newest first.

**Response**

| Field | Type | Description |
|---|---|---|
| `id` | string | Game UUID |
| `opponentId` | string | Opponent identifier |
| `result` | string | `'win'`, `'loss'`, or `'draw'` (player's perspective) |
| `accuracy` | number \| null | Player accuracy 1–100; null if analysis pending |
| `strengthElo` | integer \| null | Player strength estimate for this game |
| `opponentStrengthElo` | integer \| null | Engine strength estimate for this game |
| `playedAt` | string | ISO 8601 timestamp |
| `status` | string | `'finished'`, `'analysing'`, `'failed'`, or `'in_progress'` |
| `puzzleCount` | integer | Number of drillable puzzles created |

**Example response**

```json
{
  "games": [
    {
      "id": "a1b2c3d4-e5f6-...",
      "opponentId": "maia-1400",
      "result": "win",
      "accuracy": 74.3,
      "strengthElo": 1521,
      "opponentStrengthElo": 1388,
      "playedAt": "2026-08-31T09:12:00.000Z",
      "status": "finished",
      "puzzleCount": 3
    }
  ]
}
```

---

## GET /api/games/:id/review

Full post-game review data for a single game.

**Response**

| Field | Type | Description |
|---|---|---|
| `id` | string | Game UUID |
| `analysisState` | string | `'done'`, `'pending'`, `'running'`, or `'failed'` |
| `analysisError` | string \| null | Error message if analysis failed |
| `opponentId` | string | Opponent identifier |
| `playerColor` | `'white'` \| `'black'` | Your colour in this game |
| `result` | string | Game result |
| `termination` | string | How the game ended (see termination values) |
| `accuracy` | number | Player accuracy (1–100) |
| `opponentAccuracy` | number | Opponent accuracy (1–100) |
| `strengthElo` | integer \| null | Player strength estimate (Elo) |
| `opponentStrengthElo` | integer \| null | Opponent strength estimate (Elo) |
| `strengthSe` | integer \| null | Standard error of player strength estimate |
| `opponentStrengthSe` | integer \| null | Standard error of opponent strength estimate |
| `rollingStrength` | integer \| null | Rolling inverse-variance aggregate of last 10 games |
| `rollingSe` | integer \| null | Standard error of rolling aggregate |
| `eloBefore` | integer | Elo before this game |
| `eloAfter` | integer | Elo after this game (same if unranked) |
| `moves` | array | Per-move analysis data |
| `mistakes` | array | Graded mistake positions |
| `motifSummary` | array | `[{tag, count, explanation}]` — recurring error patterns, sorted by count desc |
| `puzzleCount` | integer | Drillable puzzles extracted |

Each `moves[]` item:

| Field | Type | Description |
|---|---|---|
| `ply` | integer | Half-move number (1-based) |
| `san` | string | Move in Standard Algebraic Notation |
| `uci` | string | Move in UCI format |
| `fen` | string | Position after the move |
| `mover` | `'white'` \| `'black'` | Side that moved |
| `winPct` | number | Win% after this move (White's POV) |
| `classification` | string | `blunder`, `mistake`, `inaccuracy`, `ok`, `good`, `great`, or `best` |
| `cpLoss` | number | Centipawn loss relative to best move |

Each `mistakes[]` item:

| Field | Type | Description |
|---|---|---|
| `classification` | string | `blunder`, `mistake`, or `inaccuracy` |
| `moveSan` | string | The move played |
| `winLoss` | number | Win% points lost |
| `tags` | array | `common_trap`, `was_timed`, `engine_only` |
| `bestMoveSan` | string | Stockfish's best move |
| `findability` | number | Maia probability of finding the best move (0–1) |
| `maiaNearestModel` | string | Maia model used for findability probe |
| `engineOnly` | boolean | True if below findability gate (not drillable) |
| `sourcePly` | integer | Ply number of the mistake |
| `motifTag` | string \| null | Error pattern label (e.g. `fork`, `back_rank`, `pinned_piece`) |
| `motifExplanation` | string \| null | One-sentence description of the motif |

---

## GET /api/games/:id/quiz

Ordered puzzle positions for the post-game quiz screen. Excludes puzzles tagged `engine_only`.

**Response**

| Field | Type | Description |
|---|---|---|
| `positions` | array | Quiz puzzle positions |
| `opponentId` | string | Opponent from the game |

Each `positions[]` item:

| Field | Type | Description |
|---|---|---|
| `puzzleId` | string | Puzzle UUID |
| `fen` | string | Position to solve from |
| `sideToMove` | `'white'` \| `'black'` | Your side |
| `playedMoveSan` | string | The move you actually played (the mistake) |
| `bestMoveUci` | string | Correct move in UCI format |
| `bestMoveSan` | string | Correct move in SAN |
| `pv` | string | Principal variation (space-separated UCI moves) |
| `followupUci` | string \| null | Required followup move, if any |
| `acceptedMovesJson` | string | JSON array of moves within 3 win% of best |
| `winLoss` | number | Win% points the mistake cost |
| `piece` | string | Piece type that moved |
| `ply` | integer | Source ply in the game |
| `classification` | string | Blunder, mistake, or inaccuracy |

---

## POST /api/games/:id/analyse

Re-triggers analysis for a game in `failed` or `pending` state.

Returns **202 Accepted** immediately. Analysis runs in the background and emits WebSocket events to any connected client watching the same game.

**Error responses**

| Status | Condition |
|---|---|
| 409 | Game is not in a finished state |
| 503 | Engine pool is unavailable |

---

## GET /api/puzzles/due

Returns due FSRS cards for the drill screen, sorted by instructiveness × overdue factor.

**Query parameters**

| Parameter | Type | Description |
|---|---|---|
| `motif` | string | Optional. Filter cards to a specific motif tag (e.g. `fork`, `back_rank`). Returns only due cards matching that error pattern. |

**Response**

| Field | Type | Description |
|---|---|---|
| `cards` | array | Up to 10 due cards |
| `total` | integer | Exact number of due cards |
| `displayTotal` | string | `"40+"` when total exceeds the soft cap; otherwise the exact number as a string |

When `total` exceeds the soft cap (40), opening cards are sorted before tactical cards, then by instructiveness.

---

## GET /api/puzzles/practice

Returns cards that are not yet due, for drill-ahead practice.

**Response**

| Field | Type | Description |
|---|---|---|
| `cards` | array | Not-yet-due cards |
| `total` | integer | Total count of practice-eligible cards |

---

## POST /api/puzzles/:id/attempt

Grades a puzzle attempt and, when in drill phase, schedules the FSRS card.

**Request body**

| Field | Type | Default | Description |
|---|---|---|---|
| `move` | string | required | Move played, in UCI format (`[a-h][1-8][a-h][1-8][qrbn]?`) |
| `msTaken` | integer ≥ 0 | required | Time taken in milliseconds |
| `hintUsed` | boolean | `false` | Whether the hint button was used |
| `attemptNo` | `1` or `2` | `1` | First or retry attempt |
| `phase` | `'quiz'` or `'drill'` | `'drill'` | Scheduling context |

**Response**

| Field | Type | Description |
|---|---|---|
| `correct` | boolean | Whether the move was correct |
| `rating` | string | FSRS rating applied: `Again`, `Hard`, `Good`, or `Easy` |
| `followupRequired` | boolean | A followup move must be submitted |
| `suspectRecall` | boolean | Correct in under 2 s on first spaced review — possible position memorisation |
| `bestMoveSan` | string | Correct move in SAN |
| `pv` | string | Principal variation |
| `winLoss` | number | Win% points the original mistake cost |
| `nextDue` | string \| null | ISO 8601 timestamp of next scheduled review; null for quiz phase |

**Scheduling behaviour**

- `phase='drill'` — grades and schedules the FSRS card; `nextDue` is populated.
- `phase='quiz'` — practice mode only; creates or updates the card with `due=tomorrow` but does not advance FSRS state. `nextDue` reflects tomorrow's date.

---

## GET /api/stats

Aggregate lifetime statistics for the Stats page.

**Response**

| Field | Type | Description |
|---|---|---|
| `elo` | integer | Current win/loss Elo rating |
| `eloDelta` | integer | Elo change vs previous game |
| `eloHistory` | array | `[{elo, recordedAt}]` all-time Elo data points |
| `dueCount` | integer | Currently due FSRS cards |
| `activeCount` | integer | Cards in active FSRS state (not graduated) |
| `graduatedCount` | integer | Graduated cards (reps ≥ 5, interval > 180 days, no lapses) |
| `wins` | integer | Lifetime wins (ranked, finished) |
| `losses` | integer | Lifetime losses |
| `draws` | integer | Lifetime draws |
| `phaseBreakdown` | object | `{ opening, middlegame, endgame }` mistake counts |
| `gameHistory` | array | `[{result, playedAt}]` for date-range filtering |
| `motifBreakdown` | object | Motif tag → count across all puzzles |
| `motifAccuracy` | object | Motif tag → `{total, correct}` first-attempt drill accuracy |
| `dimensionBreakdown` | object | Skill dimension → count (tactics, positional, endgame) |
| `drillHistory` | array | `[{day, attempted, correct}]` per-day first-attempt drill accuracy (last 30 days) |
| `winRateHistory` | array | `[{day, played, won, lost, drawn}]` per-day ranked game results (last 90 days) |
| `strengthHistory` | array | `[{playedAt, strengthElo}]` per-game move-quality Elo, oldest-first |
| `accuracyHistory` | array | `[{playedAt, accuracy}]` per-game player accuracy, oldest-first |
| `rollingStrength` | integer \| null | Rolling inverse-variance move-quality Elo (last 10 eligible games) |
| `rollingSe` | integer \| null | Standard error of `rollingStrength` |
| `rollingStyleScore` | integer \| null | Rolling Maia style-match % (last 10 games with Maia probe) |
| `qualityMix` | object | Move count by quality tier across all player moves |
| `focusMotif` | object \| null | Recommended motif to drill: `{tag, explanation, drillCount, accuracy}` |

---

## Repertoire endpoints

### GET /api/repertoire/tree

Returns the full repertoire book as a directed acyclic graph.

**Response**: `{ nodes[], lineBudget }` — `nodes` is the list of position objects (keyed by EPD), each including its associated moves with roles, observation counts, and scores. `lineBudget` is the maximum number of lines the book will track (configured balance parameter).

### GET /api/repertoire/challenges

Returns all open challenges — positions where the player's preferred move may differ from the current canonical book move. Each challenge includes engine evaluation data (`engineDeltaWinPts`), trend signals, and result performance.

### GET /api/repertoire/refusals

Returns the deviation log filtered to alerted entries (`alerted_kept`, `alerted_corrected`, `alerted_timeout`).

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `200` | Maximum entries to return (max 500) |

**Response**

| Field | Type | Description |
|---|---|---|
| `refusals` | array | Deviation entries with position and outcome |
| `keptCount` | integer | Times the player chose to keep their move |
| `keptInBookCount` | integer | Of those, times the kept move was later admitted to the book |
| `hitRatePct` | number | Percentage of kept moves that ended up in the book |

### GET /api/repertoire/changelog

The book change feed — all role transitions and promotions.

**Query parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | integer | `50` | Maximum entries (max 200) |

Entries are enriched with `fromSan` and `toSan` (UCI → SAN conversion).

**Changelog event kinds**: `promote`, `retire`, `confirm`, `refuse`, `settle`, `reverse`, `elect`, `quarantine_exit`

### POST /api/repertoire/changelog/:id/reverse

Reverses a `promote` or `settle` changelog entry. Restores the incumbent move to canonical, suppresses the challenger for a configurable number of encounters, and appends a `reverse` entry to the changelog.

**Error responses**

| Status | Condition |
|---|---|
| 404 | Changelog entry not found |
| 409 | Entry kind is not reversible (only `promote` and `settle` are reversible) |

### GET /api/repertoire/coverage

**Response**

| Field | Type | Description |
|---|---|---|
| `totalNodes` | integer | Total EPD positions in the book |
| `coveredNodes` | integer | Positions with a canonical move |
| `coveragePct` | number | `coveredNodes / totalNodes × 100` |
| `canonicalCount` | integer | Total canonical moves across all positions |

### GET /api/repertoire/journey

Timeline, cumulative growth series, and milestones derived from up to 500 most recent changelog entries.

**Response**

| Field | Type | Description |
|---|---|---|
| `timeline` | array | Dated list of book events |
| `growthSeries` | array | `{ date, canonicalCount, nodeCount }` data points |
| `milestones` | array | Named events (first confirm, first alert, coverage thresholds) |

### GET /api/repertoire/gaps

Opponent replies with significant Maia reach probability but no book coverage — positions where you are likely to encounter a move you have not studied.

**Response**: `{ gaps }` — `gaps` is an array sorted by `reachProbability` descending. Each entry includes the EPD, the opponent move, and the estimated reach probability.

---

## Error codes

| Code | Description |
|---|---|
| `weights_missing` | Engine weights file not found on disk |
| `game_not_found` | No game exists with the provided ID |
| `analysis_failed` | Post-game analysis encountered an unrecoverable error |
| `engine_unavailable` | Engine pool is not ready or all engines are busy |
| `rate_limited` | Hint requested too soon (once per 2 seconds) |
| `invalid_message` | Inbound WebSocket message failed Zod validation |
