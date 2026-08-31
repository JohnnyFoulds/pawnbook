---
title: WebSocket API
---

# WebSocket API

pawnbook uses a single WebSocket endpoint at `ws://localhost:3000/ws`. All messages are JSON objects with a `type` field.

```js
const ws = new WebSocket('ws://localhost:3000/ws')
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  console.log(msg.type, msg)
}
```

The server enforces a maximum payload of 4096 bytes per message.

---

## Inbound messages (client → server)

All inbound messages are validated by Zod (`src/schemas/messages.js`). An invalid or malformed message returns an `error` response with `error_code: 'invalid_message'` — the connection is not closed.

### new_game

Start a new game against an engine opponent.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `type` | `'new_game'` | yes | — | Message type |
| `opponentId` | string | yes | — | Opponent ID from `GET /api/opponents` |
| `color` | `'white'` \| `'black'` \| `'random'` | yes | — | Your colour |
| `ranked` | boolean | no | `true` | Whether to apply Elo changes on game end |
| `timeControl` | `{initialSec, incSec}` \| `null` | no | `null` | Fischer time control. `initialSec` must be > 0; `incSec` must be ≥ 0. `null` = untimed |
| `coachEnabled` | boolean | no | `true` | Enable the opening repertoire coach |

**Example**

```json
{
  "type": "new_game",
  "opponentId": "maia-1400",
  "color": "white",
  "ranked": true,
  "timeControl": { "initialSec": 600, "incSec": 5 },
  "coachEnabled": true
}
```

### move

Submit your move. The move must be a legal move in the current position.

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `'move'` | yes | Message type |
| `uci` | string | yes | Move in UCI format. Pattern: `[a-h][1-8][a-h][1-8][qrbn]?`. Promotion piece must be specified for pawn promotion (e.g., `e7e8q`). |

**Example**

```json
{ "type": "move", "uci": "e2e4" }
```

### resign

Resign the current game.

```json
{ "type": "resign" }
```

### hint

Request a hint — highlights the piece that should move. Rate-limited to one request per 2 seconds. Only available in unranked games.

```json
{ "type": "hint" }
```

### resume

Resume a previously interrupted game.

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `'resume'` | yes | Message type |
| `gameId` | string (UUID) | yes | The game ID to resume |

```json
{ "type": "resume", "gameId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

### repertoire_choice

Respond to a `repertoire_alert` from the opening coach. This message uses a strict Zod schema — no additional fields are permitted.

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `'repertoire_choice'` | yes | Message type |
| `choice` | `'correct'` \| `'keep'` | yes | `correct` plays the book move. `keep` plays your original move and opens a challenge. |

```json
{ "type": "repertoire_choice", "choice": "correct" }
```

---

## Outbound messages (server → client)

### game_started

Sent immediately after `new_game` or `resume` is processed.

| Field | Type | Description |
|---|---|---|
| `type` | `'game_started'` | |
| `gameId` | string | Game UUID |
| `fen` | string | Starting FEN position |
| `youPlay` | `'white'` \| `'black'` | Your assigned colour |
| `legalMoves` | array | Legal moves in the starting position (UCI strings) |
| `clock` | object \| null | `{ whiteMs, blackMs }` if timed; null if untimed |
| `resumed` | boolean | `true` if this is a resumed game |

### move_accepted

Sent after the server validates your move.

| Field | Type | Description |
|---|---|---|
| `type` | `'move_accepted'` | |
| `fen` | string | Position after your move |
| `san` | string | Your move in SAN |
| `legalMoves` | array | Engine's legal replies (UCI strings) |
| `check` | boolean | Whether your move delivered check |
| `clockUpdate` | object \| null | `{ whiteMs, blackMs }` after your time was debited |

### engine_move

Sent after the engine plays its move.

| Field | Type | Description |
|---|---|---|
| `type` | `'engine_move'` | |
| `uci` | string | Engine move in UCI format |
| `san` | string | Engine move in SAN |
| `fen` | string | Position after the engine's move |
| `legalMoves` | array | Your legal replies (UCI strings) |
| `gameOver` | `{ result: string, termination: string }` \| null | Present when this move ends the game; same `result`/`termination` values as `game_over` |
| `clock` | object \| null | `{ whiteMs, blackMs }` after engine's time was debited |

### game_over

Sent twice per game. The first send (immediately on game end) has `eloBefore: null, eloAfter: null`. The second send (after analysis completes) populates the Elo fields.

| Field | Type | Description |
|---|---|---|
| `type` | `'game_over'` | |
| `result` | `'win'` \| `'loss'` \| `'draw'` | Game result from the player's perspective |
| `termination` | string | How the game ended (see below) |
| `eloBefore` | integer \| null | Elo before this game; null on first send |
| `eloAfter` | integer \| null | Elo after this game; null on first send; same as `eloBefore` for unranked games |

**Termination values**

| Value | Meaning |
|---|---|
| `checkmate` | Checkmate |
| `stalemate` | Stalemate |
| `threefold` | Threefold repetition |
| `insufficient_material` | Insufficient material on both sides |
| `fifty_move` | Fifty-move rule |
| `timeout` | Flag fall (time ran out) |
| `resignation` | Player resigned |

### hint_result

Sent in response to a `hint` message.

| Field | Type | Description |
|---|---|---|
| `type` | `'hint_result'` | |
| `pieceSquare` | string | Square of the piece that should move (e.g., `e2`) |

---

## Coach messages

These messages are sent during play when the opening repertoire coach is active.

### repertoire_alert

The coach has detected a deviation from your repertoire book. The player's move is not yet committed — the game is paused for `REP_ALERT_TIMEOUT_SEC` (60) seconds waiting for a `repertoire_choice`.

| Field | Type | Description |
|---|---|---|
| `type` | `'repertoire_alert'` | |
| `kind` | string | Deviation kind (see below) |
| `playerUci` | string | The move you played |
| `playerSan` | string | Your move in SAN |
| `bookUci` | string \| null | The book's canonical move in UCI; null for `novelty` |
| `bookSan` | string \| null | The book's canonical move in SAN; null for `novelty` |
| `costWinPts` | number | Estimated win% cost of deviating from the book move |

**Alert kind values**

| Kind | Description |
|---|---|
| `order_slip` | You played the right move but in the wrong order |
| `lapse` | You played a move you've learned before but is currently not canonical |
| `refused_repeat` | You played a move the gates have already refused as unsound |
| `novelty` | You played a move not yet in the book at all |

### ranked_changed

Sent the first time the coach fires an alert in a game. The game is automatically switched to unranked.

```json
{ "type": "ranked_changed", "ranked": false }
```

---

## Analysis messages

Sent after the game ends, as the three-pass analysis pipeline runs.

### analysis_progress

| Field | Type | Description |
|---|---|---|
| `type` | `'analysis_progress'` | |
| `gameId` | string | Game UUID |
| `phase` | integer | Analysis pass (1, 2, or 3) |
| `done` | integer | Positions completed in current pass |
| `total` | integer | Total positions in current pass |
| `overallPct` | number | Weighted overall progress (0–100) |

Pass weights: pass 1 = 76%, pass 2 = 22%, pass 3 = 2%.

### Error messages

```json
{
  "type": "error",
  "error_code": "invalid_message",
  "message": "Human-readable description",
  "detail": "Optional technical detail"
}
```

---

## Coach state machine

```
                  ┌──────────┐
                  │  playing  │
                  └─────┬─────┘
       book deviation   │  (coach active, within ply 30,
                        │   bootstrap complete, alert budget remaining)
                  ┌─────▼──────────────────┐
                  │    alert pending        │
                  │    (60 sec window)      │
                  └──┬──────────────────┬───┘
           correct   │                  │   keep
                  ┌──▼──────┐   ┌───────▼──────────────────┐
                  │ book    │   │ original move applied     │
                  │ move    │   │ challenge opened           │
                  │ played  │   │ game remains unranked      │
                  └─────────┘   └───────────────────────────┘

    timeout after 60 s → original move applied, no challenge opened
```

**Coach guards** — the alert fires only when all of:
- `coachEnabled` was `true` when the game started
- At least 20 canonical nodes are confirmed in the book (bootstrap guard)
- Current ply ≤ 30 (`REP_PLY_MAX`)
- Fewer than 3 alerts have fired in this game (`REP_ALERTS_PER_GAME_MAX`)
