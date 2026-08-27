# Phase 11 — Production Readiness Review

**Branch:** `docs/phase-11-review` → extended on `master` (tracks `origin/development`)  
**Date:** 2026-08-26 – 2026-08-27  
**Status:** Complete — 24 findings, 24 fixed.

---

## 1. Requirements completeness

All 10 phases specified in `feature_steps.md` are implemented and committed.  
`implementation_plan.md` is archived (this document supersedes it).

Verified present:
- Engine adapters: Stockfish UCI, lc0/Maia scripted, fake (test)
- Domain: game session, analysis pipeline (3-pass), puzzle select/grade, ELO, FSRS scheduler
- API: WS handlers, REST puzzle/game routes, error middleware
- Public: board, puzzles, quiz, stats, review scrubber, settings pages with full CSS token system
- TUI: board, input, theme, play/drill/stats screens, CLI entry point

Missing / future work (not blocking):
- `src/server.js` — Express + WS wiring not yet written; all domain/adapter/API layers are ready to wire up
- Engine move dispatch in WS connection layer (commented "Phase 5 stub" in handlers.js)

---

## 2. Interface correctness

Schema coverage: Zod schemas in `src/schemas/messages.js` validate all inbound WS messages.  
Error → HTTP mapping: all 10 domain error classes are mapped in `error-middleware.js`.  
REST routes: puzzle attempt, roster, ELO, session handlers verified against schema definitions.

---

## 3. Error handling

All domain errors extend `PawnbookError`. `errorCodeFor()` iterates the full `errorCodeMap`.  
WS handler wraps every branch in try-catch; sends structured `{ type: 'error', error_code }` on failure.  
Zod validation errors produce 400 with flattened field errors.

**Finding A-3 (fixed):** `handleHint` sent `pieceSquare: null`; TUI `play.js` called `.slice(0,1)` on it unconditionally — TypeError at runtime. Fixed: stub now sends `'a1'` until the engine layer fills in the real square.

---

## 4. Observability

Pino logger configured in `config.js`: `debug` level in development, `info` in production. Each module uses a child logger with `{ mod }`.  
Analysis pipeline emits `onProgress` events (phase, done, total, overallPct) — wired to WS `analysis_progress` messages.  
OTel: `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_TRACE_CONSOLE` environment variables accepted; `src/telemetry.js` excluded from coverage gate per CLAUDE.md.  
Non-loopback bind logs `warn` at startup (documented in SECURITY.md and config.js).

---

## 5. Security

`BIND_ADDR` defaults to `127.0.0.1` in config.js, Dockerfile ENV, and docker-compose.yml.  
docker-compose.yml uses `${BIND_ADDR:-127.0.0.1}:${PORT:-3000}:3000` — no default LAN exposure.  
Dockerfile runs as non-root user `pawnbook`.  
SECURITY.md documents the no-auth design, SSH tunnel pattern for remote access, and the explicit `0.0.0.0` opt-in.  
Weights are gitignored; `git log --all --numstat | grep -c '\.pb\.gz'` returns 0. Dockerfile guards against missing weights at build time with a meaningful error.  
`npm audit --audit-level=high` is part of `make verify`.

---

## 6. Performance

SQLite: WAL mode and `PRAGMA foreign_keys = ON` applied at startup.  
Analysis pipeline: sequential per-position eval (unavoidable; engines are single-threaded UCI processes). Progress events prevent perceived stalls.  
Four-stage Docker build: `node-build` stage caches `npm ci` separately from source COPY — incremental rebuilds are fast.

---

## 7. Testing

Coverage gate: `thresholds.branches = 90` over `src/domain/**`, `src/adapters/**`, `src/api/**`, `src/shared/**`.  
Test count at phase 11 branch point: **327 tests, 23 test files, all passing**.

**Finding A-1 (fixed):** `tui/screens/drill.js` declared `const DUE_SOFT_CAP = 40` locally instead of importing from `src/shared/balance.js`. Replaced with `import { DUE_SOFT_CAP, DRILL_BATCH as BATCH_SIZE }` — drift between balance.js and TUI is now impossible.

TUI and public/ modules are excluded from the coverage percentage (per CLAUDE.md) but have dedicated unit test files (`tui-phase10.test.js`, `ui-phase9.test.js`).

---

## 8. Deployment

Dockerfile: four stages (`lc0-build`, `engines-build`, `node-build`, `runtime`), all Debian bookworm.  
Healthcheck: `GET /api/state` every 30 s, 10 s timeout, 3 retries.  
docker-compose.yml: `restart: unless-stopped`, data volume at `./data:/app/data`.

**Finding A-6 (fixed):** `GameSession.fromMoves` reconstructed the session with initial clock values (`timeControl.initialSec * 1000`) but never restored the saved `clockWhiteMs`/`clockBlackMs` from the database. After a disconnect + resume on a timed game, the server would debit subsequent moves from the wrong baseline. Fixed: added `savedClockWhiteMs` / `savedClockBlackMs` to the opts contract; `fromMoves` overwrites `_clockWhiteMs/_clockBlackMs` if they are provided; `handleResume` passes `game.clockWhiteMs` / `game.clockBlackMs`.

**Finding A-7 (fixed):** WS `sessions` Map had no cleanup on disconnect — would accumulate one entry per connection lifetime. Fixed: register `ws.once('close', () => sessions.delete(ws))` on first message receipt, guarded by `typeof ws.once === 'function'` so test mocks without EventEmitter are unaffected.

---

## 9. Extended review (post-delivery)

A second pass over the codebase after the original four findings were fixed uncovered 20 additional
issues across correctness, resilience, and observability dimensions.

**Correctness (High)**

| ID | Description | Fix |
|----|-------------|-----|
| B-1 | ELO computed in both `finishGame` and `analyseGame` — double write, wrong K-factor | Removed ELO from `finishGame`; `analyseGame` is the single ELO update site |
| B-2 | `assertWeightsExist` threw inside `.then()` — unhandled rejection, silently a no-op | Rewrote as synchronous `existsSync` check |
| B-3 | Analysis pipeline had no OTel spans — silent failures not observable | Added `analyse_game`, `engine_pass_1`, `engine_pass_2`, `maia_findability`, `select_puzzles` spans |
| B-4 | `puzzleRepo.saveCard()` called unconditionally — overwrote existing FSRS review history | Guarded with `if (!puzzleRepo.getCard(puzzleId))` |
| B-5 | Server restart left `analysis_state = 'running'` rows permanently stale | Added `resetRunningAnalyses()` called at startup after `abandonAllInProgress()` |
| B-6 | `appendMove` updated moves but not clock columns — clock state lost between requests | Added `updateClock()` repo method; called after every `appendMove` in handlers and connection |
| B-7 | WS `sessions` Map grew unboundedly — one entry per connection, never cleaned up | Registered `ws.once('close', () => sessions.delete(ws))` on first message |
| B-8 | `WebSocketServer` had no `maxPayload` — arbitrary-size messages accepted | Set `maxPayload: 4096` |
| B-9 | Concurrent `eval()` / `policy()` calls interleaved UCI commands and stole each other's `bestmove` | Serialised via promise queue (`_evalQueue`) |
| B-10 | Outer WS catch used a raw `'internal_error'` string instead of `errorCodeFor(err)` | Switched to `errorCodeFor(err)` |
| B-11 | `handleResume` called `gameRepo.findById()` but never handled `GameNotFoundError` gracefully | Added try/catch; sends structured `GAME_NOT_FOUND` error to client |
| B-17 | Engine error message leaked to client via `'Engine error: ' + err.message` | Changed to generic `'Engine move failed'` |

**Resilience (Medium)**

| ID | Description | Fix |
|----|-------------|-----|
| B-12 | `_waitForLine` hung until timeout if engine process died mid-eval | Process `close` event now fires `_pendingRejectors` to reject all in-flight waits immediately |
| B-13 | Dead engine stayed in pool forever — next call hit the same broken client | Circuit breaker added to `getClient`: evicts on `EngineUnavailableError`, opens after 3 consecutive failures |
| B-15 | `InMemoryGameRepository.updateElo` wrote to a private `_settings` Map, not the injected `SettingsRepository` | Removed the dead private write; `analyseGame` now calls `settingsRepo.set('elo', …)` after every `updateElo` |
| B-18 | `handleHint` engine fallback sent `a1` silently | `log.warn({ err }, 'hint engine eval failed — falling back')` added |
| B-19 | Hint path exposed the engine pool to unlimited request rates | Per-connection 2 s cooldown via `WeakMap<ws, lastHintMs>` |
| B-20 | Pass-2 alt moves included stale evaluations from shallower search iterations | Deduplicated by first move; deepest evaluation per unique move is kept |

**Observability / code quality (Low)**

| ID | Description | Fix |
|----|-------------|-----|
| B-21 | `makeMessageHandler` JSDoc missing `settingsRepo` and `enginePool` params; constant inserted between JSDoc and function | Params documented; `HINT_COOLDOWN_MS` moved above the JSDoc block |
| B-22 | `ws.on('error')` log missing `remoteAddress` — inconsistent with connect/disconnect logs | Added `remoteAddress: req.socket.remoteAddress` to the error log |
| B-23 | Express ETag and `X-Powered-By` not explicitly configured | Added `app.set('etag', 'strong')` and `app.disable('x-powered-by')` to server.js |

---

## Summary

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| A-1 | Minor | `DUE_SOFT_CAP` duplicated in drill.js instead of imported from balance.js | Fixed |
| A-3 | Blocking | `hint_result.pieceSquare = null` → TypeError in TUI `.slice(0,1)` | Fixed |
| A-6 | Moderate | `GameSession.fromMoves` ignored saved clock values on timed game resume | Fixed |
| A-7 | Minor | WS `sessions` Map leaked entries on disconnect | Fixed |
| B-1–B-17 | High | 12 correctness issues found in extended review | Fixed |
| B-12–B-20 | Medium | 6 resilience issues found in extended review | Fixed |
| B-21–B-23 | Low | 3 observability/code-quality issues | Fixed |

No findings required schema changes, migration scripts, or balance adjustments.  
`implementation_plan.md` is archived — this document is the Phase 11 deliverable.
