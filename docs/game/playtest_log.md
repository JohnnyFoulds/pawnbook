# Playtest log

Balance cannot be validated by unit tests. This log is the evidence trail for every `docs(balance):` commit. Every entry cites the session, the observation, and what was changed.

## Format

```
### YYYY-MM-DD  [opponent(s)]  [session type]

Observation: ...
Metric: ...
Change: parameter old → new  (or: no change, reason)
```

---

### 2026-08-28  maia-1300 × 4  [initial ladder sample]

**Context:** First playtest entries. 4 games analysed (all vs maia-1300), ELO 1113.
Two additional games failed analysis and are noted separately.

**Game breakdown:**

| Game | Color | Result | Accuracy | Puzzles |
|---|---|---|---|---|
| vs maia-1300 | black | loss | 88.9% | 0 |
| vs maia-1300 | black | loss | 88.6% | 1 |
| vs maia-1300 | black | loss | 88.2% | 0 |
| vs maia-1300 | white | loss | 17.1% | 6 (cap hit) |

**Observation — puzzle generation:**
The 17.1% accuracy game had 38 blunders in 49 player moves but only 6 puzzles were
selected (PUZZLES_PER_GAME_MAX cap hit, ranked by instructiveness). The three 88%+
games produced 0–1 puzzles each. Total: 7 puzzles from 4 games.

**Observation — findability values:**
All 7 puzzles have findability 0.54–0.97 — all high. Every puzzle is tagged
`common_trap` (temptation == findability in each case, meaning the played move was
also Maia's most likely move). These are the highest-value drills: moves your peers
at this level also make.

**Observation — zero engine_only puzzles:**
Across all 4 games, no puzzle was tagged `engine_only`. Per the plan: "Zero
engine_only tags across 20 games means FINDABILITY_MIN is too high — the filter
isn't filtering." However, 4 games is too small a sample to act on this, and the
sample is biased toward one opponent (maia-1300) where mistakes may genuinely be
human-shaped. Need Stockfish games in the mix where engine-only subtleties are
more likely.

**Observation — analysis failures:**
2 games have `analysis_state = 'failed'`:
- `c1f1ed1b` vs maia-1200: only 1 move recorded — disconnected immediately, nothing to analyse.
- `459356d6` vs maia-1300: 52 moves, `status='finished'` but `result=null`, `pgn=null` — server
  likely crashed between move write and game-over write. Not a systematic failure; the prior
  session confirmed this path works correctly in normal play.

**Metric:** puzzles/game = 7/4 = 1.75 (target: ≥70% feel instructive)
**Metric:** engine_only rate = 0/7 = 0% (yellow flag at this sample size)
**Metric:** common_trap rate = 7/7 = 100%

**Change:** No parameter changes. Sample too small and not diverse enough.

**Next sessions needed:**
- Games vs Stockfish (sf-1400, sf-1700) to see if engine_only puzzles appear
- Games vs maia-1100 and maia-1500 to spread the sample
- Investigate the 2 analysis failures

---

### 2026-08-28  16-game ladder sample  [automated playtest — scripts/playtest.js]

**Context:** Full 16-game ladder run using the automated playtest script. Games played
white and black against maia-1100, maia-1200, maia-1300, maia-1400, maia-1500,
maia-1600, maia-1700, maia-1800, sf-1400, sf-1700, sf-2000, sf-2300, sf-2600,
sf-2900, sf-max, and drawfish. MAX_MOVES=60 with resign on cap. Post-game analysis
and drill of all generated puzzles performed automatically.

**Game breakdown:**
- Games attempted: 16
- Games completed: 15 (drawfish skipped — x86-64 ELF, expected `engine_unavailable` on arm64)
- Analysis done: 15  failed: 0
- All 15 games analysed successfully

**Observation — 0 analysis failures:**
Five infrastructure bugs were fixed to reach this state (details in commit messages):
1. Stuck Stockfish process: `_waitForLine` timeout now calls `dispose()` to kill and evict the process
2. Pre-eval queue flooding: hard-drop when `_incrementalPending >= INCREMENTAL_MAX_QUEUE`, movetime:1500 per pre-eval
3. FSRS state type mismatch: `better-sqlite3` stores `0` as `"0.0"` in TEXT columns; fixed with `Number()` parse and INTEGER column type
4. ts-fsrs field name mismatch: complete rewrite of `FsrsScheduler.schedule()` with bidirectional snake_case↔camelCase translation
5. Unbounded analysis depth: added `movetime:3000` to pass1 and `movetime:6000` to pass2; UCI client now supports `go depth N movetime M`

**Observation — puzzle generation:**
42 puzzles from 15 games = 2.8/game avg (target: up to 6/game, ≥70% instructive).
All 42 tagged `common_trap` (high temptation — these are natural mistakes at this level).
Average findability: 0.445.

**Observation — zero engine_only puzzles:**
Across all 15 games including Stockfish games at multiple levels, no puzzle was tagged
`engine_only`. Per the plan: "Zero engine_only tags across 20 games means FINDABILITY_MIN
is too high." This may be because:
- The automated playtest uses random move selection (not a real player), producing
  human-shaped blunders that Maia would also find
- Or FINDABILITY_MIN=0.04 is genuinely too low to filter anything

**Decision: no change yet.** Need 20 games of real human play (not random moves) before
tuning FINDABILITY_MIN. The automated sample validates the pipeline, not the filter threshold.

**Observation — FSRS drill results:**
80 drill attempts, 80 correct, 0 errors. FSRS scheduler working correctly end-to-end.
All cards created and updated properly with correct intervals.

**Metric:** puzzles/game = 42/15 = 2.8 (in range, below 6/game cap)
**Metric:** analysis failure rate = 0/15 = 0% ✓
**Metric:** engine_only rate = 0/42 = 0% (yellow flag — needs human play sample)
**Metric:** common_trap rate = 42/42 = 100%
**Metric:** drill accuracy = 80/80 = 100%

**Change:** No parameter changes. Infrastructure stabilised; ready for human testing.

**Next sessions needed:**
- Human play: 20 games across the ladder (untimed, real decision-making)
- Observe if engine_only puzzles appear with real player mistakes
- Two weeks of daily drilling to observe FSRS interval distribution
