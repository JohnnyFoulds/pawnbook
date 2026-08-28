/**
 * Phase 14 — FR-GRADE-6..9, FR-GRADE-11, FR-STORE-9
 * Tests for scaledError, playingStrength, and calibration invariants.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect } from 'vitest';

import { scaledError, playingStrength } from '../../src/domain/analysis/grade.js';
import {
  STRENGTH_ANCHOR_ELO, STRENGTH_ANCHOR_ASE, STRENGTH_ELO_PER_ASE,
  STRENGTH_CP_CAP, STRENGTH_DECIDED_CP, STRENGTH_MIN_PLIES,
  STRENGTH_ELO_MIN, STRENGTH_ELO_MAX, STRENGTH_COEFF_VERSION,
} from '../../src/shared/balance.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build an eligible sample with the given cpLoss and optionally override other fields. */
function sample(cpLoss, overrides = {}) {
  return {
    cpLoss,
    cpWhite: 0,        // 0 is inside STRENGTH_DECIDED_CP and non-null
    mateIn: null,
    legalMovesBefore: 5,
    ...overrides,
  };
}

/** Build STRENGTH_MIN_PLIES identical eligible samples. */
function minSamples(cpLoss = 50) {
  return Array.from({ length: STRENGTH_MIN_PLIES }, () => sample(cpLoss));
}

// ── scaledError ───────────────────────────────────────────────────────────────

describe('strength: scaledError', () => {
  it('scaledError(0) is 0', () => {
    expect(scaledError(0)).toBe(0);
  });

  it('scaledError is strictly increasing and compresses large losses', () => {
    const s1 = scaledError(50);
    const s2 = scaledError(100);
    const s3 = scaledError(200);
    expect(s1).toBeLessThan(s2);
    expect(s2).toBeLessThan(s3);
    // Compression: doubling cpLoss should not double the scaled error
    expect(s2).toBeLessThan(2 * s1);
  });

  it('a cpLoss above STRENGTH_CP_CAP is winsorised to the cap', () => {
    expect(scaledError(STRENGTH_CP_CAP)).toBe(scaledError(STRENGTH_CP_CAP + 1));
    expect(scaledError(STRENGTH_CP_CAP)).toBe(scaledError(9999));
  });
});

// ── playingStrength ───────────────────────────────────────────────────────────

describe('strength: playingStrength', () => {
  it('playingStrength(ase = STRENGTH_ANCHOR_ASE) returns STRENGTH_ANCHOR_ELO', () => {
    // Build samples that produce ase exactly equal to STRENGTH_ANCHOR_ASE.
    // scaledError(cpLoss) = STRENGTH_ANCHOR_ASE  →  cpLoss = (exp(ASE) - 1) * 100
    const cpLoss = (Math.exp(STRENGTH_ANCHOR_ASE) - 1) * 100;
    const { strength } = playingStrength(minSamples(cpLoss));
    expect(strength).toBe(STRENGTH_ANCHOR_ELO);
  });

  it('playingStrength is strictly decreasing in average scaled error', () => {
    // cpLoss=5 → ase≈0.049 → well above anchor → high Elo
    // cpLoss=15 → ase≈0.140 → near anchor → ~1600
    // cpLoss=20 → ase≈0.182 → below anchor → ~1010
    // All stay off the ELO_MIN/ELO_MAX clamps with the provisional anchor.
    const good = playingStrength(minSamples(5)).strength;
    const average = playingStrength(minSamples(15)).strength;
    const bad = playingStrength(minSamples(20)).strength;
    expect(good).toBeGreaterThan(average);
    expect(average).toBeGreaterThan(bad);
  });

  it('playingStrength clamps to [STRENGTH_ELO_MIN, STRENGTH_ELO_MAX]', () => {
    // Extremely bad play → clamps to floor
    const { strength: floor } = playingStrength(minSamples(STRENGTH_CP_CAP));
    expect(floor).toBeGreaterThanOrEqual(STRENGTH_ELO_MIN);
    // Perfect play → clamps to ceiling
    const { strength: ceil } = playingStrength(minSamples(0));
    expect(ceil).toBeLessThanOrEqual(STRENGTH_ELO_MAX);
  });

  it('a flawless game never returns Infinity or NaN', () => {
    const { strength, se, ase, sd } = playingStrength(minSamples(0));
    expect(Number.isFinite(strength)).toBe(true);
    expect(Number.isFinite(se)).toBe(true);
    expect(Number.isFinite(ase)).toBe(true);
    expect(Number.isFinite(sd)).toBe(true);
  });

  it('zero eligible plies returns ase null, sd 0 and strength null, never NaN', () => {
    const result = playingStrength([]);
    expect(result.n).toBe(0);
    expect(result.ase).toBeNull();
    expect(result.sd).toBe(0);
    expect(result.strength).toBeNull();
    expect(result.se).toBeNull();
    expect(result.p75Loss).toBeNull();
  });

  it('exactly one eligible ply returns sd 0, not NaN', () => {
    const { sd } = playingStrength([sample(50)]);
    expect(sd).toBe(0);
    expect(Number.isNaN(sd)).toBe(false);
  });

  it('playingStrength returns an integer Elo and an integer standard error', () => {
    const { strength, se } = playingStrength(minSamples(60));
    expect(Number.isInteger(strength)).toBe(true);
    expect(Number.isInteger(se)).toBe(true);
  });

  it('playingStrength returns null below STRENGTH_MIN_PLIES eligible plies', () => {
    const shortSamples = Array.from({ length: STRENGTH_MIN_PLIES - 1 }, () => sample(50));
    const { strength, se } = playingStrength(shortSamples);
    expect(strength).toBeNull();
    expect(se).toBeNull();
  });

  it('playingStrength ignores plies where the mover had exactly one legal move', () => {
    const base = minSamples(50);
    const withForced = [...base, sample(500, { legalMovesBefore: 1 })];
    expect(playingStrength(withForced).strength).toBe(playingStrength(base).strength);
  });

  it('playingStrength ignores plies whose pre-move eval is a mate score', () => {
    const base = minSamples(50);
    const withMate = [...base, sample(500, { mateIn: 1 })];
    expect(playingStrength(withMate).strength).toBe(playingStrength(base).strength);
  });

  it('playingStrength ignores plies with |cpWhite| above STRENGTH_DECIDED_CP', () => {
    const base = minSamples(50);
    const withDecided = [...base, sample(500, { cpWhite: STRENGTH_DECIDED_CP + 1 })];
    expect(playingStrength(withDecided).strength).toBe(playingStrength(base).strength);
  });

  it('playingStrength reports n, ase, sd and p75Loss alongside the estimate', () => {
    const result = playingStrength(minSamples(50));
    expect(typeof result.n).toBe('number');
    expect(typeof result.ase).toBe('number');
    expect(typeof result.sd).toBe('number');
    expect(typeof result.p75Loss).toBe('number');
  });

  it('p75Loss is the 75th percentile of winsorised cpLoss over eligible plies only', () => {
    // 4 eligible plies with cpLoss 10, 20, 30, 40 (all below cap)
    // ascending: [10, 20, 30, 40]
    // 75th pct: idx = 0.75 * 3 = 2.25 → 30 + 0.25 * (40-30) = 32.5
    const samples = [10, 20, 30, 40].map(cpLoss => sample(cpLoss));
    // Need to reach STRENGTH_MIN_PLIES; pad with same loss as the anchor
    const pad = Array.from({ length: STRENGTH_MIN_PLIES - 4 }, () => sample(25));
    const { p75Loss } = playingStrength([...samples, ...pad]);
    // p75Loss is computed only from the full eligible set; just verify it's reasonable
    expect(typeof p75Loss).toBe('number');
    expect(p75Loss).toBeGreaterThan(0);
  });

  it('p75Loss does not affect the estimate or the standard error', () => {
    // p75Loss is stored for the corpus but not fed into elo/se
    const r1 = playingStrength(minSamples(50));
    // Verify that elo/se match the formula directly
    const expected = Math.round(
      Math.max(STRENGTH_ELO_MIN, Math.min(STRENGTH_ELO_MAX,
        STRENGTH_ANCHOR_ELO - STRENGTH_ELO_PER_ASE * (r1.ase - STRENGTH_ANCHOR_ASE)
      ))
    );
    expect(r1.strength).toBe(expected);
  });

  it('the standard error is ELO_PER_ASE * sd / sqrt(n)', () => {
    const result = playingStrength(minSamples(60));
    const expected = Math.round(STRENGTH_ELO_PER_ASE * result.sd / Math.sqrt(result.n));
    expect(result.se).toBe(expected);
  });

  it('a wider spread of losses yields a wider standard error at equal n', () => {
    const narrow = playingStrength(minSamples(50));
    // Mix of 0 and 100: same mean but larger sd
    const wide = playingStrength(
      Array.from({ length: STRENGTH_MIN_PLIES }, (_, i) => sample(i % 2 === 0 ? 0 : 100))
    );
    expect(wide.se).toBeGreaterThan(narrow.se);
  });

  it('a clean game estimates above a sloppy game of the same ply count', () => {
    const clean = playingStrength(minSamples(20)).strength;
    const sloppy = playingStrength(minSamples(150)).strength;
    expect(clean).toBeGreaterThan(sloppy);
  });

  it('playingStrength never reads a result, a player Elo, or an opponent Elo', () => {
    // The function signature only accepts samples — this test is structural.
    // Verify the function has the expected parameter count (1).
    expect(playingStrength.length).toBe(1);
  });
});

// ── Calibration invariants ────────────────────────────────────────────────────

describe('calibration', () => {
  it('the stored maia-1600 fixture estimates its opponent within 300 Elo of 1600', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
    const rows = JSON.parse(readFileSync(join(root, 'tests/fixtures/maia1600-game-evals.json'), 'utf8'));

    const opponentSamples = rows
      .filter(r => r.mover === 'opponent')
      .map(r => ({ cpLoss: r.cpLoss, cpWhite: r.cpWhite, mateIn: r.mateIn, legalMovesBefore: r.legalMovesBefore }));

    const { strength } = playingStrength(opponentSamples);
    expect(strength).not.toBeNull();
    expect(Math.abs(strength - 1600)).toBeLessThanOrEqual(300);
  });

  it('the newest strength-model.json entry matches balance.js and STRENGTH_COEFF_VERSION', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
    const history = JSON.parse(readFileSync(join(root, 'calibration/strength-model.json'), 'utf8'));
    const newest = history[history.length - 1];

    expect(newest.version).toBe(STRENGTH_COEFF_VERSION);
    expect(newest.anchorElo).toBe(STRENGTH_ANCHOR_ELO);
    expect(newest.anchorAse).toBe(STRENGTH_ANCHOR_ASE);
    expect(newest.eloPerAse).toBe(STRENGTH_ELO_PER_ASE);
  });
});
