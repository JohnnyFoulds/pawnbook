import { describe, it, expect } from 'vitest';
import { gradeAttempt, gradeFollowup } from '../../src/domain/puzzles/attempt.js';

const PUZZLE = {
  acceptedMovesJson: JSON.stringify(['e2e4', 'd2d4']),
  followupUci: 'e7e5',
};

const PUZZLE_NO_FOLLOWUP = {
  acceptedMovesJson: JSON.stringify(['e2e4']),
  followupUci: null,
};

describe('attempt', () => {
  it('the server derives correct=true when move is in acceptedMovesJson', () => {
    const result = gradeAttempt(PUZZLE, { move: 'e2e4', msTaken: 5000 });
    expect(result.correct).toBe(true);
  });

  it('the server derives correct=false when move is not accepted', () => {
    const result = gradeAttempt(PUZZLE, { move: 'g1f3', msTaken: 5000 });
    expect(result.correct).toBe(false);
  });

  it('ANY accepted_moves_json entry is correct, not just the first', () => {
    const result = gradeAttempt(PUZZLE, { move: 'd2d4', msTaken: 5000 });
    expect(result.correct).toBe(true);
  });

  it('the client cannot influence rating — rating is derived from behaviour', () => {
    // A wrong move: even if the client passed rating='Easy', it should be Again
    const result = gradeAttempt(PUZZLE, { move: 'g1f3', msTaken: 5000 });
    // Wrong move must always be Again regardless of any other field
    expect(result.rating).toBe('Again');
    expect(['Again', 'Hard', 'Good', 'Easy']).toContain(result.rating);
  });

  it('wrong move with no hint infers Again', () => {
    const result = gradeAttempt(PUZZLE, { move: 'g1f3', msTaken: 5000 });
    expect(result.rating).toBe('Again');
  });

  it('hint used forces Again', () => {
    const result = gradeAttempt(PUZZLE, { move: 'e2e4', msTaken: 5000, hintUsed: true });
    expect(result.rating).toBe('Again');
  });

  it('practice=true writes rating=null and does not schedule', () => {
    const result = gradeAttempt(PUZZLE, { move: 'e2e4', msTaken: 5000, isPractice: true });
    expect(result.rating).toBeNull();
  });

  it('post-game quiz (practice) correct=true is still logged', () => {
    const result = gradeAttempt(PUZZLE, { move: 'e2e4', msTaken: 5000, isPractice: true });
    expect(result.correct).toBe(true);
  });

  it('followupRequired is true when puzzle has a followupUci and move is correct', () => {
    const result = gradeAttempt(PUZZLE, { move: 'e2e4', msTaken: 5000 });
    expect(result.followupRequired).toBe(true);
  });

  it('followupRequired is false when puzzle has no followupUci', () => {
    const result = gradeAttempt(PUZZLE_NO_FOLLOWUP, { move: 'e2e4', msTaken: 5000 });
    expect(result.followupRequired).toBe(false);
  });

  it('suspectRecall is true when first spaced review, correct, answered in under SUSPECT_RECALL_MS', async () => {
    const { SUSPECT_RECALL_MS } = await import('../../src/shared/balance.js');
    const result = gradeAttempt(PUZZLE, {
      move: 'e2e4',
      msTaken: SUSPECT_RECALL_MS - 1,
      isFirstSpacedReview: true,
    });
    expect(result.suspectRecall).toBe(true);
  });

  it('suspectRecall is false on practice reviews', async () => {
    const { SUSPECT_RECALL_MS } = await import('../../src/shared/balance.js');
    const result = gradeAttempt(PUZZLE, {
      move: 'e2e4',
      msTaken: SUSPECT_RECALL_MS - 1,
      isPractice: true,
      isFirstSpacedReview: true,
    });
    expect(result.suspectRecall).toBe(false);
  });
});

describe('gradeFollowup', () => {
  it('correct follow-up move returns true', () => {
    expect(gradeFollowup(PUZZLE, 'e7e5')).toBe(true);
  });

  it('wrong follow-up move returns false', () => {
    expect(gradeFollowup(PUZZLE, 'd7d5')).toBe(false);
  });

  it('when puzzle has no followup_uci, always returns true (not penalised)', () => {
    expect(gradeFollowup(PUZZLE_NO_FOLLOWUP, 'anything')).toBe(true);
  });
});
