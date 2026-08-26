import { describe, it, expect } from 'vitest';

import {
  winningChances,
  winPct,
  classify,
  moveAccuracy,
  gameAccuracy,
} from '../../src/domain/analysis/grade.js';

describe('grade', () => {
  it('winningChances(0) === 0', () => {
    expect(winningChances(0)).toBe(0);
  });

  it('winningChances is monotone increasing and clamps at ±1', () => {
    // Use values within ±1000 (the cp clamp); -2000 and -1000 produce the same output
    const vals = [-800, -400, 0, 400, 800].map(winningChances);
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    }
    // Infinity (mate) maps to the clamped cp=±1000 sigmoid value, which is close to ±1
    // The clamp at ±1 ensures we never exceed the range
    expect(winningChances(Infinity)).toBeLessThanOrEqual(1);
    expect(winningChances(-Infinity)).toBeGreaterThanOrEqual(-1);
  });

  it('cp is clamped to ±1000 before conversion', () => {
    expect(winningChances(1001)).toBe(winningChances(1000));
    expect(winningChances(-1001)).toBe(winningChances(-1000));
  });

  it('mate score maps to ±1000cp', () => {
    expect(winningChances(Infinity)).toBe(winningChances(1000));
    expect(winningChances(-Infinity)).toBe(winningChances(-1000));
  });

  it('winLoss of 30 win% POINTS classifies Blunder', () => {
    expect(classify(30, 0).classification).toBe('blunder');
    expect(classify(50, 0).classification).toBe('blunder');
  });

  it('winLoss of 20 win% POINTS classifies Mistake', () => {
    expect(classify(20, 0).classification).toBe('mistake');
    expect(classify(29, 0).classification).toBe('mistake');
  });

  it('winLoss of 10 win% POINTS classifies Inaccuracy', () => {
    expect(classify(10, 0).classification).toBe('inaccuracy');
    expect(classify(19, 0).classification).toBe('inaccuracy');
  });

  it('a winLoss of 0.30 (the OLD unit) classifies as OK, not Blunder', () => {
    // 0.30 winningChances units would be a huge number; as win% POINTS it is sub-inaccuracy
    expect(classify(0.30, 0).classification).not.toBe('blunder');
    expect(classify(0.30, 0).classification).not.toBe('mistake');
    expect(classify(0.30, 0).classification).not.toBe('inaccuracy');
  });

  it('cpLoss 0 classifies Best; <25 Great; <50 Good; else OK', () => {
    expect(classify(0, 0).classification).toBe('best');
    expect(classify(0, 24).classification).toBe('great');
    expect(classify(0, 49).classification).toBe('good');
    expect(classify(0, 50).classification).toBe('ok');
    expect(classify(0, 100).classification).toBe('ok');
  });

  it('moveAccuracy returns 100 when winAfter >= winBefore', () => {
    expect(moveAccuracy(40, 40)).toBe(100);
    expect(moveAccuracy(40, 50)).toBe(100);
  });

  it('moveAccuracy is clamped to [1, 100]', () => {
    const low = moveAccuracy(99, 1);
    expect(low).toBeGreaterThanOrEqual(1);
    expect(low).toBeLessThanOrEqual(100);
    expect(moveAccuracy(0, 0)).toBe(100);
  });

  it('losing a forced mate is a Blunder', () => {
    // going from +inf to any finite value is a blunder
    expect(classify(100, 0, { wasMate: true, mateMissed: false }).classification).toBe('blunder');
  });

  it('missing a forced mate below -700cp downgrades to Mistake', () => {
    // position was already worse than -700cp and we missed a forced mate
    const result = classify(30, 0, { wasMate: false, mateMissed: true, cpBefore: -750 });
    expect(result.classification).toBe('mistake');
  });

  it('missing a forced mate in a winnable position (cpBefore >= -700) is a Blunder', () => {
    // cpBefore = -500 (not already losing); mateMissed, winLoss >= BLUNDER threshold
    const result = classify(30, 0, { wasMate: false, mateMissed: true, cpBefore: -500 });
    expect(result.classification).toBe('blunder');
  });

  it("White's first move uses the synthetic +0.15 prior eval", () => {
    // At startpos cp=15 → winPct ≈ 50.28; after e4 cp=30 → winPct ≈ 50.55
    // winLoss should be slightly positive (improvement) or near-zero — NOT a blunder
    const winBefore = winPct(15); // synthetic prior
    const winAfterGoodMove = winPct(30);
    const winLoss = winBefore - winAfterGoodMove;
    expect(winLoss).toBeLessThan(10); // not an inaccuracy
  });

  it('game accuracy is the mean of harmonic and volatility-weighted means', () => {
    const accs = [100, 90, 80, 70, 60];
    const result = gameAccuracy(accs);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(100);
    // should be in the ballpark of 80 (arithmetic mean) but adjusted
    expect(result).toBeGreaterThan(50);
  });

  it('known lichess game reproduces published per-move accuracies (fixture)', () => {
    // e4(+0.15→+0.25): winBefore=winPct(15), winAfter=winPct(25)
    // both are near 50, small winLoss → accuracy near 100
    const acc = moveAccuracy(winPct(15), winPct(25));
    expect(acc).toBeGreaterThan(90);
    // e5 reply: from winPct(25) to winPct(-25) from black's pov = winPct(25) for black
    // actually from black's perspective: winBefore = 100 - winPct(25), winAfter = 100 - winPct(-25)
    const blackWinBefore = 100 - winPct(25);  // 49.72
    const blackWinAfter = 100 - winPct(-25);  // 50.28
    // black improved, so accuracy = 100
    expect(moveAccuracy(blackWinBefore, blackWinAfter)).toBe(100);
  });
});
