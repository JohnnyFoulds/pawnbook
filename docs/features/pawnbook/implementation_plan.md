# Implementation plan

**Status:** ARCHIVED — superseded by `phase-11-review.md` (Phase 11 complete, 2026-08-26).

This document tracked per-session pseudocode, the exact tests each session turns green, suggested commit messages, and DoD.

---

## Phase 1 checklist

- [ ] `src/errors.js` — `PawnbookError` base + all specific classes + `ErrorCode`
- [ ] `src/config.js` — env parsing, pino config, balance constants loaded from `src/shared/balance.js`
- [ ] `src/ports/engine-client.js` — JSDoc @interface
- [ ] `src/ports/repositories.js` — JSDoc @interface for Game, Puzzle, Review, Settings
- [ ] `src/ports/clock.js` — JSDoc @interface
- [ ] `src/ports/scheduler.js` — JSDoc @interface
- [ ] `src/shared/balance.js` — the tuning table (initial values)
- [ ] `tests/unit/errors.test.js`
- [ ] `tests/unit/config.test.js`
- [ ] CI passing on the initial push
