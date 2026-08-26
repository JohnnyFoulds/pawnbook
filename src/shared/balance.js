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

// Time controls offered (null = untimed)
export const TIME_CONTROLS = [
  null,
  { initialSec: 600, incSec: 0 },   // 10+0
  { initialSec: 300, incSec: 3 },   // 5+3
  { initialSec: 180, incSec: 2 },   // 3+2
];
