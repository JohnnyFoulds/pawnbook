# API contract — auto-repertoire

**Status:** Phase 37 — 2026-08-30 (updated for field renames in Phases 20–22, journey route added in Phase 36)  
Machine-readable counterpart: Zod schemas in `src/schemas/messages.js` and route handlers in
`src/api/routes/repertoire.js` (created in Phase 22). This document is the authoritative shape
description; the Zod schemas are the enforcement.

---

## WebSocket messages

### Alert state machine

```
                   ┌──────────────────┐
  move received ──►│  CHECKING (held) │
                   └────────┬─────────┘
                            │ no alert or not in budget
                            ▼
                       apply move ──► normal flow

                   ┌──────────────────┐
  move received ──►│  ALERTING (held) │
                   └────────┬─────────┘
                            │ ◄──── clock PAUSED ────────►
                 ┌──────────┴──────────┐
         correct │                     │ keep
                 ▼                     ▼
          apply book move       apply player move
          source=corrected      source=keep / open challenge
                 │                     │
                 └──────────┬──────────┘
                            │ clock RESUMED
                            ▼
                       normal flow

  timeout (REP_ALERT_TIMEOUT_SEC):
    apply player move, resolution=alerted_timeout, NO challenge opened

  resign / disconnect while held:
    clear pending move, no deviation row written
```

### Outbound: `repertoire_alert`

Sent when a move is held pending the player's decision.

```json
{
  "type": "repertoire_alert",
  "kind": "order_slip",
  "playedUci": "d2d4",
  "bookUci": "e2e4",
  "winPctCost": null,
  "timeoutSec": 60
}
```

| Field | Type | Notes |
|---|---|---|
| `kind` | `string` | One of the deviation kinds from §FR-REP-BOOK (§5 table) |
| `playedUci` | `string` | The move the player tried to make |
| `bookUci` | `string \| null` | The canonical book move, or null if none (should not alert — but included defensively) |
| `winPctCost` | `number \| null` | Win% points cost vs engine best; null for `order_slip` and `refused_repeat` where cost is shown differently |
| `timeoutSec` | `number` | Always `REP_ALERT_TIMEOUT_SEC` |

### Inbound: `repertoire_choice`

The player's decision after receiving an alert. Zod schema MUST use `.strict()`.

```json
{ "type": "repertoire_choice", "decision": "keep" }
```

| Field | Type | Constraint |
|---|---|---|
| `decision` | `'correct' \| 'keep'` | Literal union; no other value accepted; no other fields permitted |

Handled by the same WS dispatcher that handles `'move'`. The handler MUST verify that a pending
move exists for this connection before acting (`NoPendingMoveError` if not).

### Outbound: `ranked_changed`

Sent when the first alert in a game flips it unranked.

```json
{ "type": "ranked_changed", "reason": "repertoire_coach", "gameId": 42 }
```

### Outbound: `repertoire_update`

Post-game summary sent after analysis + book update. Notification only; the book does not wait for
the client to acknowledge it.

```json
{
  "type": "repertoire_update",
  "confirmed": 3,
  "candidates": 5,
  "newChallenges": 0,
  "coveragePct": 71.4,
  "inBookDepth": 8.2
}
```

---

## REST routes

All under `/api/repertoire`. Mounted in `src/server.js` as part of Phase 22.

### `GET /api/repertoire/tree`

Returns the book DAG for display in `public/repertoire.html`.

**Response 200:**
```json
{
  "nodes": [
    {
      "epd": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3",
      "side": "black",
      "minPly": 2,
      "reachProb": 0.82,
      "lineLoss": 2.1,
      "moves": [
        {
          "uci": "c7c5",
          "san": "c5",
          "role": "canonical",
          "observations": 14,
          "meanWinLossPts": 4.2,
          "scoreW": 6, "scoreD": 3, "scoreL": 5
        }
      ]
    }
  ]
}
```

### `GET /api/repertoire/coverage`

**Response 200:**
```json
{
  "coveragePct": 71.4,
  "inBookDepth": 8.2,
  "confirmedNodes": 87,
  "candidateNodes": 12,
  "gaps": [
    {
      "epd": "...",
      "parentUci": "c7c5",
      "opponentReply": "d2d4",
      "reachProb": 0.083,
      "inXGames": 12
    }
  ]
}
```

### `GET /api/repertoire/challenges`

Returns open challenges. Read-only.

**Response 200:**
```json
{
  "challenges": [
    { "id": 1, "epd": "...", "incumbentUci": "e7e5", "challengerUci": "c7c5",
      "challengerPlays": 1, "incumbentPlays": 0, "engineDelta": null, "status": "open" }
  ]
}
```

### `GET /api/repertoire/refusals`

Refusal log with inferred interpretation, signal values and outcome.

**Response 200:**
```json
{
  "refusals": [
    {
      "id": 1,
      "epd": "...",
      "incumbentUci": "e2e4",
      "challengerUci": "d2d4",
      "openedAt": 1234567890,
      "moveMsTaken": 4200,
      "moveMsZscore": 1.8,
      "decisionMsTaken": 3100,
      "engineDelta": 0.8,
      "resultChallengerPerf": 0.62,
      "resultChallengerN": 8,
      "status": "promoted",
      "rule": "3",
      "inferredInterpretation": "genuine_change"
    }
  ]
}
```

`inferredInterpretation` is one of `'misclick'`, `'experiment'`, `'genuine_change'`,
`'regretted_lapse'` — derived, never stored.

### `GET /api/repertoire/changelog`

Book change feed, most recent first.

**Response 200:**
```json
{
  "entries": [
    {
      "id": 5,
      "at": 1234567890,
      "epd": "...",
      "kind": "promote",
      "fromUci": "e7e5",
      "toUci": "c7c5",
      "fromSan": "e5",
      "toSan": "c5",
      "rule": "3",
      "detailJson": "{ \"challengerPlays\": 2, \"engineDelta\": -0.4 }",
      "reversible": true
    }
  ]
}
```

### `GET /api/repertoire/journey`

Player-facing history view derived by replaying `rep_changelog`. No snapshot table — all three
fields are computed on-the-fly from the append-only log.

**Response 200:**
```json
{
  "timeline": [
    {
      "date": "2025-06-01",
      "entries": [
        { "id": "c1", "at": 1748736000000, "kind": "confirm", "fromSan": null,
          "toSan": "e4", "rule": null, "detailJson": null }
      ]
    }
  ],
  "growthSeries": [
    { "date": "2025-06-01", "confirms": 1, "promotes": 0, "retires": 0, "refuses": 0, "total": 1 }
  ],
  "milestones": {
    "firstConfirm":   { "at": 1748736000000, "kind": "confirm" },
    "coachWoke":      null,
    "firstPromotion": null,
    "firstRefusal":   null,
    "firstReversal":  null
  }
}
```

`growthSeries` values are cumulative as of each `date`. `total = confirms + promotes − retires`.
Milestones are `null` until reached. `coachWoke` fires at the 20th cumulative confirm.

### `POST /api/repertoire/changelog/:id/reverse`

Reverses a book change. Allowed only if the change is still reversible (not already superseded).

**Request:** no body required.

**Response 200:** `{ "ok": true, "suppressedUntil": 1050 }` (encounter count)  
**Response 404:** `RepertoireNodeNotFoundError` — change id not found  
**Response 409:** `ChallengeNotOpenError` — change already superseded

---

## Zod schema excerpts (`src/schemas/messages.js`)

```js
export const RepertoireChoiceSchema = z.object({
  type: z.literal('repertoire_choice'),
  decision: z.enum(['correct', 'keep']),
}).strict();  // .strict() rejects any extra field — enforces invariant 10
```

The `.strict()` call is the technical enforcement of "we never ask him to classify anything" — any
classification field added to the client would be caught here, not silently ignored.

```js
export const RepertoireAlertSchema = z.object({
  type: z.literal('repertoire_alert'),
  kind: z.string(),
  playedUci: z.string(),
  bookUci: z.string().nullable(),
  winPctCost: z.number().nullable(),
  timeoutSec: z.number(),
});
```
