# Implementation plan

**Status:** Phase 0 complete. Phase 1 next.

This document tracks per-session pseudocode, the exact tests each session turns green, suggested commit messages, and DoD. Archived on Phase 11 completion.

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
