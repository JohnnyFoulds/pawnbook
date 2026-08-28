/**
 * @module shared/balance
 * Balance parameters — tuning table for the game loop.
 * Documented with rationale in docs/game/balance.md.
 * A regression test asserts this file and the doc agree.
 * A balance change requires a docs(balance): commit.
 */

export const FINDABILITY_MIN = 0.04;
export const POLICY_TEMPERATURE = 1.0;
export const PUZZLES_PER_GAME_MAX = 6;
export const NEAR_MISS_WIN_PTS = 2.0;
export const RATING_FAST_MS = 6000;
export const RATING_SLOW_MS = 25000;
export const SUSPECT_RECALL_MS = 2000;

// Classification thresholds — win% POINTS (0–100), not winningChances (−1..+1)
export const BLUNDER_WIN_PTS = 30;
export const MISTAKE_WIN_PTS = 20;
export const INACCURACY_WIN_PTS = 10;

// Sub-inaccuracy tiers — centipawn loss (the one place cp is used)
export const GREAT_CP_MAX = 25;
export const GOOD_CP_MAX = 50;

export const ELO_DIFF_CLAMP = 400;
export const ELO_FLOOR = 100;
export const K_PROVISIONAL = 40;
export const K_MID = 20;
export const K_HIGH = 10;
export const K_PROVISIONAL_GAMES = 15;
export const K_MID_ELO_MAX = 2100;

export const DRILL_BATCH = 10;
export const DUE_SOFT_CAP = 40;
export const TARGET_RETENTION = 0.90;
export const GRADUATE_REPS = 5;
export const GRADUATE_INTERVAL_D = 180;

// Phase derivation thresholds
export const ENDGAME_MATERIAL_MAX = 13;
export const OPENING_PLY_MAX = 20;

// Incremental analysis — pass-1 pre-evaluation during play
// Switch to catch-up depth (18) when the analysis queue exceeds this many pending jobs.
export const INCREMENTAL_MAX_QUEUE = 5;
// Depth used for incremental pass-1 (deeper than post-game default because wall-clock
// time is plentiful while the player thinks).
export const INCREMENTAL_DEPTH = 20;

// Playing-strength estimate — scaled error → Elo (docs/game/balance.md § Playing strength)
export const STRENGTH_ANCHOR_ELO   = 1600;
export const STRENGTH_ANCHOR_ASE   = 0.2638;  // mean ase of two maia-1600 opponent sides
export const STRENGTH_ELO_PER_ASE  = 6500;    // Regan slope (13034) scaled by ada/ase ratio (0.137/0.2638≈0.519); both maia-1600 games land within 295 Elo
export const STRENGTH_CP_CAP       = 300;
export const STRENGTH_DECIDED_CP   = 600;
export const STRENGTH_MIN_PLIES    = 12;
export const STRENGTH_ELO_MIN      = 600;
export const STRENGTH_ELO_MAX      = 2900;
export const STRENGTH_ROLLING_N    = 10;
export const STRENGTH_COEFF_VERSION = 1;      // = newest calibration/strength-model.json version

// Time controls offered (null = untimed)
export const TIME_CONTROLS = [
  null,
  { initialSec: 600, incSec: 0 },   // 10+0
  { initialSec: 300, incSec: 3 },   // 5+3
  { initialSec: 180, incSec: 2 },   // 3+2
];
