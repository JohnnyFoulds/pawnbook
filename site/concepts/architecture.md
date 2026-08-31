---
title: Architecture
---

# Architecture

pawnbook is structured as three layers with a strict one-way dependency rule. The layers enforce a clean separation between infrastructure concerns (databases, engines, HTTP) and the domain logic that makes the application work.

## Three-layer model

```
┌─────────────────────────────────────────────┐
│  Layer 3 — Interface                        │
│  src/api/   public/   tui/                  │
│  REST routes, WebSocket handlers, browser   │
│  SPA, terminal UI                           │
├─────────────────────────────────────────────┤
│  Layer 2 — Domain                           │
│  src/domain/                                │
│  Game logic, analysis, puzzles, repertoire  │
├─────────────────────────────────────────────┤
│  Layer 1 — Ports (contracts)                │
│  src/ports/                                 │
│  + Adapters (implementations)               │
│  src/adapters/                              │
│  SQLite, engines, clock, scheduler, IDs     │
└─────────────────────────────────────────────┘
```

**Dependency rule**: dependencies flow downward only. Domain code (`src/domain/`) never imports from `express`, `ws`, `better-sqlite3`, or `child_process`. Interface code (`src/api/`, `public/`, `tui/`) contains no business logic — it delegates entirely to domain functions and application services.

This makes the domain fully testable in isolation. Every infrastructure concern is replaceable with a fake that implements the same port contract.

## The five ports

Ports are defined in `src/ports/` as JSDoc interface descriptions with no runtime code. Each port has at least one production adapter and one test adapter.

| Port | Production adapter | Test adapter |
|---|---|---|
| `Clock` | `SystemClock` | `FixedClock` (frozen at a given instant) |
| `EngineClient` | `UciEngineClient` | `ScriptedEngineClient` (predefined move sequences) |
| `IdGenerator` | `UuidIds` | `SequentialIds` (1, 2, 3, …) |
| Repositories | `Sqlite*` (four implementations) | `InMemory*` (four implementations) |
| `Scheduler` | `RealTimer` | `ManualTimer` (manually advanced) |

**EngineClient** methods:
- `eval(fen, opts)` → `EvalResult[]` (depth, cp, mate, bestmove, pv per MultiPV line)
- `policy(fen, weightsPath)` → `PolicyResult` (move → probability map)
- `bestmove(fen, opts)` → UCI string

**Repositories**: four contracts covering `GameRepository`, `PuzzleRepository`, `SettingsRepository`, and `RepertoireRepository`. The `RepertoireRepository` alone has 25+ methods spanning nodes, moves, observations, challenges, audits, changelog, suppressions, provenance, and policy.

## Composition root

`src/server.js` is the only place where adapters are instantiated and wired together. On startup it:

1. Opens the SQLite database and creates all four repository instances
2. Creates `SystemClock`, `UuidIds`, `FsrsScheduler`, `RealTimer`
3. Calls `gameRepo.abandonAllInProgress()` and `gameRepo.resetRunningAnalyses()` — engine processes don't survive a server restart
4. Verifies `settings.elo` is consistent with `elo_history`; re-derives the value if not
5. Creates the `EnginePool` (real UCI pool, or fake when `ENGINE_MODE=fake`)
6. Mounts REST routes under `/api/`
7. Starts the WebSocket server at path `/ws`, maxPayload 4096 bytes

## Application factory

`src/app.js` exposes the same wiring logic but accepts all adapters as parameters. This is the entry point for the test harness, which injects `FixedClock`, `ManualTimer`, `SequentialIds`, a fake engine pool, and either an in-memory or `:memory:` SQLite database.

The journey test suite (`tests/support/journey/`) uses a real SQLite database in `:memory:` mode — never `InMemoryRepository` — because the repository contract parity is imperfect and real SQLite catches schema and query issues that in-memory implementations miss.

## WebSocket vs REST

| Concerns | Transport |
|---|---|
| Active game session (moves, clock, coach alerts) | WebSocket (`/ws`) |
| Post-game analysis progress | WebSocket (`/ws`) |
| Dashboard state, stats, game history | REST (`/api/`) |
| Puzzle review, drill attempts, repertoire views | REST (`/api/`) |

Game sessions are stateful objects held in a `Map<ws, GameSession>` inside the WebSocket handler. `GameSession` wraps `chess.js` and manages move validation, clock, termination detection, and coach state. When the client reconnects, `fromMoves()` replays persisted moves from `game_moves` to rebuild state.

## Engine pool

`src/adapters/engine/engine-pool.js` manages engine subprocess lifecycles. Key behaviours:

- One shared Maia-3 subprocess (`maia3` binary) — `SelfElo` and `OppoElo` are set per move
- Stockfish instances are created per analysis job (not per game)
- Different resource configs by job type:

| Job | Threads | Hash |
|---|---|---|
| Pass-1 (analysis) | 4 | 512 MB |
| Pass-2 (MultiPV candidates) | 6 | 1024 MB |
| Incremental pre-eval | 1 | 16 MB |
| In-game hint | 1 | 16 MB |

- The pool serialises access; concurrent analysis jobs queue behind each other
