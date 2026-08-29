import { describe, it, expect } from 'vitest';
import { processGame } from '../../../src/domain/repertoire/build.js';
import {
  REP_CONFIRM_OBS,
  REP_PLY_MAX,
  REP_QUARANTINE_WIN_PTS,
} from '../../../src/shared/balance.js';

// White-to-move FEN (starting position) so sideFromFen returns 'white'
const BASE_EPD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
const BASE_FEN = BASE_EPD + ' 0 1';
const NOW = 1_700_000_000_000;

function makeEval(ply, overrides = {}) {
  return {
    ply,
    fen: BASE_FEN,
    mover: 'player',
    win_before: 52,
    win_after: 50,
    win_loss_pts: 2,
    classification: 'good',
    best_move_uci: 'e2e4',
    ...overrides,
  };
}

function baseOpts(overrides = {}) {
  return {
    gameId: 'g1',
    playerColor: 'white',
    gameResult: 'win',
    gameMoves: [{ ply: 1, uci: 'e2e4', san: 'e4' }],
    moveEvals: [makeEval(1)],
    existingNodes: [],
    existingMoves: [],
    provenanceId: 1,
    bookVersion: 0,
    source: 'game',
    nowMs: NOW,
    ...overrides,
  };
}

// First-play existingNodes/Moves fixtures for "second play" tests
function existingCandidate() {
  return {
    existingNodes: [{
      epd: BASE_EPD, side: 'white', fen: BASE_FEN,
      firstSeen: NOW - 1000, lastSeen: NOW - 1000,
      timesReached: 1, encounters: 1, minPly: 1,
      reachProb: null, reachStale: true, lineLoss: 2,
      voteFrozenUntilEncounter: null,
    }],
    existingMoves: [{
      epd: BASE_EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4',
      role: 'candidate', observations: 1,
      weightedScore: null, meanWinLossPts: 2, worstWinLossPts: 2,
      auditId: null, gateReason: null,
      scoreW: 0, scoreD: 0, scoreL: 0,
      firstPlayed: NOW - 1000, lastPlayed: NOW - 1000,
    }],
  };
}

describe('processGame', () => {
  it('new move creates a candidate observation', () => {
    const { observations, moveUpserts } = processGame(baseOpts());
    expect(observations).toHaveLength(1);
    expect(observations[0].source).toBe('game');
    expect(moveUpserts).toHaveLength(1);
    expect(moveUpserts[0].role).toBe('candidate');
    expect(moveUpserts[0].observations).toBe(1);
  });

  it('second play promotes candidate to canonical when gates pass', () => {
    const { moveUpserts, changelogEntries } = processGame(baseOpts(existingCandidate()));
    const move = moveUpserts.find(m => m.moveUci === 'e2e4');
    expect(move.role).toBe('canonical');
    expect(changelogEntries).toHaveLength(1);
    expect(changelogEntries[0].kind).toBe('confirm');
  });

  it('coach_corrected does not count toward confirmation', () => {
    const { moveUpserts, changelogEntries } = processGame(baseOpts({
      source: 'coach_corrected',
      ...existingCandidate(),
    }));
    // Observations are recorded
    // But coach_corrected skips the move upsert step entirely — no moveUpserts from coach_corrected
    // The existingMoves are carried through unchanged (no update)
    expect(changelogEntries).toHaveLength(0);
    // move should not have been promoted — it's not in moveUpserts at all (source=coach_corrected skips)
    expect(moveUpserts.find(m => m.moveUci === 'e2e4')?.role ?? 'candidate').toBe('candidate');
  });

  it('quarantine zone: win_loss_pts in [10,20) promotes to quarantined', () => {
    const { moveUpserts } = processGame(baseOpts({
      moveEvals: [makeEval(1, { win_loss_pts: 15 })],
      ...existingCandidate(),
    }));
    expect(moveUpserts[0].role).toBe('quarantined');
  });

  it('refused: win_loss_pts >= REP_QUARANTINE_WIN_PTS promotes to refused', () => {
    const { moveUpserts } = processGame(baseOpts({
      moveEvals: [makeEval(1, { win_loss_pts: REP_QUARANTINE_WIN_PTS })],
      ...existingCandidate(),
    }));
    expect(moveUpserts[0].role).toBe('refused');
  });

  it('forced mate proxy: near-zero win_after + blunder → refused', () => {
    const { moveUpserts } = processGame(baseOpts({
      moveEvals: [makeEval(1, { win_after: 3, classification: 'blunder', win_loss_pts: 5 })],
      ...existingCandidate(),
    }));
    expect(moveUpserts[0].role).toBe('refused');
  });

  it('line_loss is minimum over paths', () => {
    // Existing node has lineLoss=5; current game path has cumulativeLoss=2
    const { nodeUpserts } = processGame(baseOpts({
      existingNodes: [{
        epd: BASE_EPD, side: 'white', fen: BASE_FEN,
        firstSeen: NOW, lastSeen: NOW,
        timesReached: 1, encounters: 1, minPly: 1,
        reachProb: null, reachStale: true, lineLoss: 5,
        voteFrozenUntilEncounter: null,
      }],
      existingMoves: [],
      moveEvals: [makeEval(1, { win_loss_pts: 2 })],
    }));
    expect(nodeUpserts[0].lineLoss).toBe(2);
  });

  it('line_loss does not increase when second path is more expensive', () => {
    const { nodeUpserts } = processGame(baseOpts({
      existingNodes: [{
        epd: BASE_EPD, side: 'white', fen: BASE_FEN,
        firstSeen: NOW, lastSeen: NOW,
        timesReached: 1, encounters: 1, minPly: 1,
        reachProb: null, reachStale: true, lineLoss: 3,
        voteFrozenUntilEncounter: null,
      }],
      existingMoves: [],
      moveEvals: [makeEval(1, { win_loss_pts: 8 })],
    }));
    expect(nodeUpserts[0].lineLoss).toBe(3);
  });

  it('moves beyond REP_PLY_MAX are not processed', () => {
    const { observations } = processGame(baseOpts({
      gameMoves: [{ ply: REP_PLY_MAX + 1, uci: 'e2e4', san: 'e4' }],
      moveEvals: [makeEval(REP_PLY_MAX + 1)],
    }));
    expect(observations).toHaveLength(0);
  });

  it('opponent moves are not processed', () => {
    const { observations } = processGame(baseOpts({
      moveEvals: [makeEval(1, { mover: 'opponent' })],
    }));
    expect(observations).toHaveLength(0);
  });

  it('first move at node becomes canonical when no existing canonical', () => {
    const { moveUpserts } = processGame(baseOpts(existingCandidate()));
    expect(moveUpserts[0].role).toBe('canonical');
  });

  it('second confirmed move at node becomes alt when canonical already exists', () => {
    const { moveUpserts } = processGame(baseOpts({
      gameMoves: [{ ply: 1, uci: 'd2d4', san: 'd4' }],
      moveEvals: [makeEval(1, { win_loss_pts: 2 })],
      existingNodes: [{
        epd: BASE_EPD, side: 'white', fen: BASE_FEN,
        firstSeen: NOW, lastSeen: NOW,
        timesReached: 2, encounters: 2, minPly: 1,
        reachProb: null, reachStale: true, lineLoss: 2,
        voteFrozenUntilEncounter: null,
      }],
      existingMoves: [
        {
          epd: BASE_EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4',
          role: 'canonical', observations: 3,
          weightedScore: null, meanWinLossPts: 2, worstWinLossPts: 2,
          auditId: null, gateReason: null,
          scoreW: 2, scoreD: 0, scoreL: 1,
          firstPlayed: NOW - 2000, lastPlayed: NOW - 1000,
        },
        {
          epd: BASE_EPD, side: 'white', moveUci: 'd2d4', moveSan: 'd4',
          role: 'candidate', observations: 1,
          weightedScore: null, meanWinLossPts: 2, worstWinLossPts: 2,
          auditId: null, gateReason: null,
          scoreW: 0, scoreD: 0, scoreL: 0,
          firstPlayed: NOW - 1000, lastPlayed: NOW - 1000,
        },
      ],
    }));
    const d4 = moveUpserts.find(m => m.moveUci === 'd2d4');
    expect(d4.role).toBe('alt');
  });

  it('changelog entry created on confirmation', () => {
    const { changelogEntries } = processGame(baseOpts(existingCandidate()));
    expect(changelogEntries).toHaveLength(1);
    expect(changelogEntries[0].toUci).toBe('e2e4');
  });

  it('no changelog entry for coach_corrected plays — regression test 4', () => {
    const { changelogEntries } = processGame(baseOpts({
      source: 'coach_corrected',
      ...existingCandidate(),
    }));
    expect(changelogEntries).toHaveLength(0);
  });

  it('result is reflected in score_w when game result is win', () => {
    const { moveUpserts } = processGame(baseOpts({
      gameResult: 'win',
      ...existingCandidate(),
    }));
    expect(moveUpserts[0].scoreW).toBe(1);
    expect(moveUpserts[0].scoreL).toBe(0);
  });

  it('score_l increments on loss result', () => {
    const { moveUpserts } = processGame(baseOpts({
      gameResult: 'loss',
      ...existingCandidate(),
    }));
    expect(moveUpserts[0].scoreL).toBe(1);
    expect(moveUpserts[0].scoreW).toBe(0);
  });
});
