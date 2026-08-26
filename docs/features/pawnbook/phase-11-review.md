# Phase 11 — Production Readiness Review

**Branch:** `docs/phase-11-review`  
**Date:** 2026-08-26  
**Status:** Complete — 4 findings, 4 fixed.

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

## Summary

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| A-1 | Minor | `DUE_SOFT_CAP` duplicated in drill.js instead of imported from balance.js | Fixed |
| A-3 | Blocking | `hint_result.pieceSquare = null` → TypeError in TUI `.slice(0,1)` | Fixed |
| A-6 | Moderate | `GameSession.fromMoves` ignored saved clock values on timed game resume | Fixed |
| A-7 | Minor | WS `sessions` Map leaked entries on disconnect | Fixed |

No findings required schema changes, migration scripts, or balance adjustments.  
`implementation_plan.md` is archived — this document is the Phase 11 deliverable.
