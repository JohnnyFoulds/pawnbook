import { describe, it, expect } from 'vitest';

import { expectedScore, updateElo, kFactor, validateRanked } from '../../src/domain/game/elo.js';
import { ELO_FLOOR } from '../../src/shared/balance.js';

describe('elo', () => {
  it('expected score is 0.5 for equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBe(0.5);
  });

  it('hand-computed win at K=20 matches', () => {
    // myElo=1400, oppElo=1600, K=20 → expected=1/(1+10^(200/400))=1/(1+√10)≈0.2403
    // delta=round(20*(1-0.2403))=round(15.19)=15, newElo=1415
    const exp = expectedScore(1400, 1600);
    const result = updateElo({ myElo: 1400, oppElo: 1600, score: 1, gamesPlayed: 20 });
    // Allow ±1 because delta is rounded to integer
    expect(result.newElo).toBeCloseTo(1400 + 20 * (1 - exp), 0);
    expect(result.delta).toBe(Math.round(20 * (1 - exp)));
  });

  it('K is 40 under 15 games, 20 under 2100, else 10', () => {
    expect(kFactor({ gamesPlayed: 14, myElo: 1500 })).toBe(40);
    expect(kFactor({ gamesPlayed: 15, myElo: 1500 })).toBe(20);
    expect(kFactor({ gamesPlayed: 50, myElo: 2100 })).toBe(10);
    expect(kFactor({ gamesPlayed: 50, myElo: 2099 })).toBe(20);
  });

  it('a draw between equal ratings leaves the rating unchanged', () => {
    const result = updateElo({ myElo: 1500, oppElo: 1500, score: 0.5, gamesPlayed: 20 });
    expect(result.newElo).toBe(1500);
    expect(result.delta).toBe(0);
  });

  it('score outside {0, 0.5, 1} throws', () => {
    expect(() => updateElo({ myElo: 1500, oppElo: 1500, score: 0.3, gamesPlayed: 5 })).toThrow();
  });

  it('a rating difference beyond ±400 is clamped before expected()', () => {
    // At 1200 vs 3190 (diff=-1990), without clamping expected≈0.0000006
    // With ±400 clamp, myElo effectively 3190-400=2790 for the calculation
    const clampedExp = expectedScore(1200, 3190);
    const directExp = 1 / (1 + Math.pow(10, (3190 - 1200) / 400));
    expect(clampedExp).toBeGreaterThan(directExp);
    expect(clampedExp).toBeCloseTo(1 / (1 + Math.pow(10, 400 / 400)), 4); // clamp at 400
  });

  it('losing to sf-max at 1200 costs a non-trivial number of points', () => {
    const result = updateElo({ myElo: 1200, oppElo: 3190, score: 0, gamesPlayed: 20 });
    // R28: without clamping, expected≈0.000001 → delta≈0 (free loss, one-way ratchet)
    // With ±400 clamp, expected≈1/11≈0.091 → delta = round(20*(0-0.091)) = round(-1.82) = -2
    // Key invariant: delta is NEGATIVE (the loss costs something), not zero
    expect(result.delta).toBeLessThan(0);
    // And winning gives a bounded (not free) reward — the ratchet is closed
    const winResult = updateElo({ myElo: 1200, oppElo: 3190, score: 1, gamesPlayed: 20 });
    expect(winResult.delta).toBeLessThan(20); // not the full K
  });

  it('an opponent with a null rating cannot produce a ranked game', () => {
    expect(() => validateRanked({ oppElo: null })).toThrow();
  });

  it('an opponent with an undefined rating cannot produce a ranked game', () => {
    // Covers the || false branch: null===null is false, undefined===undefined is true
    expect(() => validateRanked({ oppElo: undefined })).toThrow();
  });

  it('rating cannot drop below ELO_FLOOR', () => {
    // Start just above the floor, lose heavily — should land at exactly ELO_FLOOR
    const result = updateElo({ myElo: ELO_FLOOR + 5, oppElo: 3190, score: 0, gamesPlayed: 100 });
    expect(result.newElo).toBeGreaterThanOrEqual(ELO_FLOOR);
  });

  it('ELO_FLOOR is enforced even for a catastrophic rating collapse', () => {
    const result = updateElo({ myElo: ELO_FLOOR, oppElo: 3190, score: 0, gamesPlayed: 100 });
    expect(result.newElo).toBe(ELO_FLOOR);
  });
});
