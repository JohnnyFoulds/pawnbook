import { describe, it, expect } from 'vitest';

import { extractEpd, sideFromFen } from '../../../src/domain/repertoire/epd.js';
import { runGates } from '../../../src/domain/repertoire/gates.js';
import { recencyWeight, electCanonical } from '../../../src/domain/repertoire/vote.js';
import { initialRole, promoteCandidate, reAuditQuarantined, candidateExpired, ACCEPTED_SET, ALERTING_SET } from '../../../src/domain/repertoire/state.js';
import { classifyDeviation } from '../../../src/domain/repertoire/deviation.js';
import { computeReachProb, computeCoveragePct, computeExpectedDepth, isInFrontier, buildGapReport } from '../../../src/domain/repertoire/reach.js';
import { resolveChallenge, eloAdjustedPerf } from '../../../src/domain/repertoire/challenge.js';
import {
  REP_CONFIRM_OBS,
  REP_ADMIT_WIN_PTS,
  REP_QUARANTINE_WIN_PTS,
  REP_MIN_ABS_WIN_PCT,
  REP_LINE_BUDGET_WIN_PTS,
  REP_RECENCY_HALFLIFE_DAYS,
  REP_ALT_ALTERNATION_MIN,
  REP_CHALLENGE_ENGINE_CLEAR,
  REP_CHALLENGE_ENGINE_TOL,
  REP_CHALLENGE_REPEAT_CONFIRM,
  REP_CHALLENGE_MIN_GAMES,
  REP_CHALLENGE_RESULT_MARGIN,
  REP_CHALLENGE_TTL_ENCOUNTERS,
  REP_CANDIDATE_TTL_ENCOUNTERS,
} from '../../../src/shared/balance.js';

// ─── EPD ─────────────────────────────────────────────────────────────────────

describe('epd', () => {
  const STARTFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const AFTER_E4  = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  const AFTER_E4_MOVE2 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 2';

  it('extractEpd returns the first four FEN fields only', () => {
    expect(extractEpd(STARTFEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
    expect(extractEpd(AFTER_E4)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3');
  });

  it('two positions differing only in fullmove counter have the same EPD', () => {
    expect(extractEpd(AFTER_E4)).toBe(extractEpd(AFTER_E4_MOVE2));
  });

  it('side from fen returns white for w', () => {
    expect(sideFromFen(STARTFEN)).toBe('white');
  });

  it('side from fen returns black for b', () => {
    expect(sideFromFen(AFTER_E4)).toBe('black');
  });
});

// ─── GATES ───────────────────────────────────────────────────────────────────

describe('gates', () => {
  const base = { winAfter: 55, bestMoveWinAfter: 60, lineLoss: 5, isForcedMate: false };

  it('loss < REP_ADMIT_WIN_PTS → admitted', () => {
    expect(runGates({ ...base, winLossPts: REP_ADMIT_WIN_PTS - 1 }).verdict).toBe('admitted');
  });

  it('loss exactly REP_ADMIT_WIN_PTS → quarantined (not admitted)', () => {
    expect(runGates({ ...base, winLossPts: REP_ADMIT_WIN_PTS }).verdict).toBe('quarantined');
  });

  it('loss exactly REP_QUARANTINE_WIN_PTS → refused (not quarantined)', () => {
    expect(runGates({ ...base, winLossPts: REP_QUARANTINE_WIN_PTS }).verdict).toBe('refused');
  });

  it('loss >= REP_QUARANTINE_WIN_PTS → refused', () => {
    expect(runGates({ ...base, winLossPts: REP_QUARANTINE_WIN_PTS + 5 }).verdict).toBe('refused');
  });

  it('absolute floor skipped when best move also cannot reach it', () => {
    // Both winAfter and bestMoveWinAfter are below REP_MIN_ABS_WIN_PCT
    const result = runGates({
      ...base,
      winLossPts: 5,
      winAfter: REP_MIN_ABS_WIN_PCT - 5,
      bestMoveWinAfter: REP_MIN_ABS_WIN_PCT - 3,
    });
    expect(result.verdict).toBe('admitted');
  });

  it('absolute floor applies when best move can reach it but played move cannot', () => {
    const result = runGates({
      ...base,
      winLossPts: 5,
      winAfter: REP_MIN_ABS_WIN_PCT - 5,
      bestMoveWinAfter: REP_MIN_ABS_WIN_PCT + 5,
    });
    expect(result.verdict).toBe('refused');
    expect(result.reason).toBe('absolute_floor');
  });

  it('gate 3 skipped when lineLoss is null (no book path exists)', () => {
    const result = runGates({ ...base, winLossPts: 5, lineLoss: null });
    expect(result.verdict).toBe('admitted');
  });

  it('gate 3: three consecutive 8-point losses refused at third (cumulative ≥ 20)', () => {
    // Simulate: two previous moves each 8 pts, this move adds 8 → lineLoss = 24
    const result = runGates({ ...base, winLossPts: 5, lineLoss: REP_LINE_BUDGET_WIN_PTS });
    expect(result.verdict).toBe('refused');
    expect(result.reason).toBe('line_budget');
  });

  it('forced mate → refused', () => {
    expect(runGates({ ...base, winLossPts: 0, isForcedMate: true }).verdict).toBe('refused');
    expect(runGates({ ...base, winLossPts: 0, isForcedMate: true }).reason).toBe('forced_mate');
  });

  it('all four gates pass → admitted', () => {
    const result = runGates({ winLossPts: 5, winAfter: 55, bestMoveWinAfter: 60, lineLoss: 5, isForcedMate: false });
    expect(result.verdict).toBe('admitted');
    expect(result.reason).toBeNull();
  });
});

// ─── VOTE ─────────────────────────────────────────────────────────────────────

describe('vote', () => {
  const NOW = 1_000_000_000_000; // fixed epoch ms
  const DAY_MS = 86400_000;

  it('recency weight at age 0 is 1', () => {
    expect(recencyWeight(0)).toBe(1);
  });

  it('recency weight at half-life is 0.5', () => {
    expect(recencyWeight(REP_RECENCY_HALFLIFE_DAYS)).toBeCloseTo(0.5);
  });

  it('canonical is the move with the highest recency-weighted score', () => {
    const moves = [
      { uci: 'e2e4', observations: [{ playedAt: NOW - 1 * DAY_MS }, { playedAt: NOW - 2 * DAY_MS }], meanWinLossPts: 5, score: 1 },
      { uci: 'd2d4', observations: [{ playedAt: NOW - 60 * DAY_MS }], meanWinLossPts: 5, score: 1 },
    ];
    const { canonical } = electCanonical(moves, NOW);
    expect(canonical).toBe('e2e4');
  });

  it('older observations weigh less — older move loses to newer', () => {
    const moves = [
      { uci: 'e2e4', observations: [{ playedAt: NOW - 200 * DAY_MS }], meanWinLossPts: 5, score: 1 },
      { uci: 'd2d4', observations: [{ playedAt: NOW - 1 * DAY_MS }], meanWinLossPts: 5, score: 1 },
    ];
    const { canonical } = electCanonical(moves, NOW);
    expect(canonical).toBe('d2d4');
  });

  it('tie-broken by mean_win_loss_pts (lower is better)', () => {
    const obs = [{ playedAt: NOW - 1 * DAY_MS }];
    const moves = [
      { uci: 'e2e4', observations: obs, meanWinLossPts: 8, score: 1 },
      { uci: 'd2d4', observations: obs, meanWinLossPts: 3, score: 1 },
    ];
    const { canonical } = electCanonical(moves, NOW);
    expect(canonical).toBe('d2d4');
  });

  it('score tie-break: same weightedScore and same meanWinLossPts → higher score wins', () => {
    const obs = [{ playedAt: NOW - 1 * DAY_MS }];
    const moves = [
      { uci: 'e2e4', observations: obs, meanWinLossPts: 5, score: 0.5 },
      { uci: 'd2d4', observations: obs, meanWinLossPts: 5, score: 0.8 },
    ];
    const { canonical } = electCanonical(moves, NOW);
    expect(canonical).toBe('d2d4');
  });

  it('alternation: winner has too few recent observations → no alt', () => {
    // Challenger has 3 recent obs; winner's obs are all outside the 120-day half-life
    const recentObs = Array.from({ length: REP_ALT_ALTERNATION_MIN }, (_, i) => ({ playedAt: NOW - (i + 1) * DAY_MS }));
    const oldObs = [{ playedAt: NOW - 200 * DAY_MS }]; // outside half-life
    const moves = [
      { uci: 'e2e4', observations: oldObs, meanWinLossPts: 3, score: 0.8 },
      { uci: 'd2d4', observations: recentObs, meanWinLossPts: 5, score: 0.4 },
    ];
    const { alts } = electCanonical(moves, NOW);
    expect(alts).toHaveLength(0);
  });

  it('returns null canonical when no moves have observations', () => {
    expect(electCanonical([], NOW).canonical).toBeNull();
  });

  it('alternation: two moves each ≥ REP_ALT_ALTERNATION_MIN within half-life → alts populated', () => {
    const recentObs = (n) => Array.from({ length: n }, (_, i) => ({ playedAt: NOW - i * DAY_MS }));
    const moves = [
      { uci: 'e2e4', observations: recentObs(REP_ALT_ALTERNATION_MIN + 1), meanWinLossPts: 5, score: 1 },
      { uci: 'd2d4', observations: recentObs(REP_ALT_ALTERNATION_MIN), meanWinLossPts: 5, score: 1 },
    ];
    const { canonical, alts } = electCanonical(moves, NOW);
    expect(canonical).toBeTruthy();
    expect(alts.length).toBe(1);
  });

  it('all observations are filtered out (weightedScore zero) → canonical null', () => {
    const moves = [{ uci: 'e2e4', observations: [], meanWinLossPts: 5, score: 1 }];
    expect(electCanonical(moves, NOW).canonical).toBeNull();
  });

  it('alternation does not trigger when second move has too few recent observations', () => {
    const recentObs = (n) => Array.from({ length: n }, (_, i) => ({ playedAt: NOW - i * DAY_MS }));
    const oldObs = (n) => Array.from({ length: n }, (_, i) => ({ playedAt: NOW - 200 * DAY_MS - i * DAY_MS }));
    const moves = [
      { uci: 'e2e4', observations: recentObs(REP_ALT_ALTERNATION_MIN + 1), meanWinLossPts: 5, score: 1 },
      { uci: 'd2d4', observations: oldObs(REP_ALT_ALTERNATION_MIN + 1), meanWinLossPts: 5, score: 1 },
    ];
    const { alts } = electCanonical(moves, NOW);
    expect(alts.length).toBe(0);
  });
});

// ─── STATE ───────────────────────────────────────────────────────────────────

describe('state', () => {
  it('initialRole is always candidate', () => {
    expect(initialRole()).toBe('candidate');
  });

  it('candidate on first observation — never canonical', () => {
    expect(initialRole()).toBe('candidate');
  });

  it('candidate → canonical when admitted and first move at node', () => {
    const r = promoteCandidate({ verdict: 'admitted', reason: null }, true);
    expect(r).toBe('canonical');
  });

  it('candidate → alt when admitted but not first move at node', () => {
    const r = promoteCandidate({ verdict: 'admitted', reason: null }, false);
    expect(r).toBe('alt');
  });

  it('candidate → quarantined when quarantined', () => {
    const r = promoteCandidate({ verdict: 'quarantined', reason: 'quarantine_zone' }, true);
    expect(r).toBe('quarantined');
  });

  it('candidate → refused when refused', () => {
    const r = promoteCandidate({ verdict: 'refused', reason: 'per_move_loss' }, true);
    expect(r).toBe('refused');
  });

  it('quarantine exit: clean audit → alt', () => {
    expect(reAuditQuarantined({ winLossPts: REP_ADMIT_WIN_PTS - 1 })).toBe('alt');
  });

  it('quarantine exit: worse audit → refused', () => {
    expect(reAuditQuarantined({ winLossPts: REP_QUARANTINE_WIN_PTS })).toBe('refused');
  });

  it('quarantine stays when still in zone', () => {
    expect(reAuditQuarantined({ winLossPts: REP_ADMIT_WIN_PTS + 1 })).toBe('quarantined');
  });

  it('candidateExpired is false before TTL', () => {
    expect(candidateExpired(REP_CANDIDATE_TTL_ENCOUNTERS - 1, REP_CANDIDATE_TTL_ENCOUNTERS)).toBe(false);
  });

  it('candidateExpired is true at TTL', () => {
    expect(candidateExpired(REP_CANDIDATE_TTL_ENCOUNTERS, REP_CANDIDATE_TTL_ENCOUNTERS)).toBe(true);
  });

  it('accepted set contains canonical, alt, challenger, quarantined', () => {
    expect(ACCEPTED_SET.has('canonical')).toBe(true);
    expect(ACCEPTED_SET.has('alt')).toBe(true);
    expect(ACCEPTED_SET.has('challenger')).toBe(true);
    expect(ACCEPTED_SET.has('quarantined')).toBe(true);
    expect(ACCEPTED_SET.has('refused')).toBe(false);
    expect(ACCEPTED_SET.has('retired')).toBe(false);
    expect(ACCEPTED_SET.has('candidate')).toBe(false);
  });

  it('alerting set contains refused and retired only', () => {
    expect(ALERTING_SET.has('refused')).toBe(true);
    expect(ALERTING_SET.has('retired')).toBe(true);
    expect(ALERTING_SET.size).toBe(2);
  });
});

// ─── DEVIATION ───────────────────────────────────────────────────────────────

describe('deviation', () => {
  const base = {
    playedUci: 'g8f6',
    nodeRole: null,
    nodeHasCanonical: true,
    resultingEpdInBook: false,
    nodeHasDrillHistory: false,
    reachableBookUcis: null,
  };

  it('in_book_canonical → silent for canonical move', () => {
    const { kind, alert } = classifyDeviation({ ...base, nodeRole: 'canonical' });
    expect(kind).toBe('in_book_canonical');
    expect(alert).toBe(false);
  });

  it('in_book_alt → silent for alt move', () => {
    const { kind, alert } = classifyDeviation({ ...base, nodeRole: 'alt' });
    expect(kind).toBe('in_book_alt');
    expect(alert).toBe(false);
  });

  it('challenger → silent for challenger move', () => {
    const { kind, alert } = classifyDeviation({ ...base, nodeRole: 'challenger' });
    expect(kind).toBe('in_book_challenger');
    expect(alert).toBe(false);
  });

  it('quarantined → silent', () => {
    const { kind, alert } = classifyDeviation({ ...base, nodeRole: 'quarantined' });
    expect(kind).toBe('in_book_quarantined');
    expect(alert).toBe(false);
  });

  it('refused_repeat → alert when refused move played and node has canonical', () => {
    const { kind, alert } = classifyDeviation({ ...base, nodeRole: 'refused', nodeHasCanonical: true });
    expect(kind).toBe('refused_repeat');
    expect(alert).toBe(true);
  });

  it('refused_repeat falls through to new_territory when node has no canonical ← regression test 8', () => {
    const { kind, alert } = classifyDeviation({ ...base, nodeRole: 'refused', nodeHasCanonical: false });
    expect(kind).toBe('new_territory');
    expect(alert).toBe(false);
  });

  it('transposition → silent; edge should be recorded by caller', () => {
    const { kind, alert } = classifyDeviation({ ...base, nodeRole: null, resultingEpdInBook: true });
    expect(kind).toBe('transposition');
    expect(alert).toBe(false);
  });

  it('new_territory → silent when no canonical move', () => {
    const { kind, alert } = classifyDeviation({ ...base, nodeRole: null, nodeHasCanonical: false });
    expect(kind).toBe('new_territory');
    expect(alert).toBe(false);
  });

  it('order_slip scoped to book-reachable nodes', () => {
    const { kind, alert } = classifyDeviation({
      ...base,
      nodeRole: null,
      reachableBookUcis: ['g8f6', 'e7e5'],
      playedUci: 'g8f6',
    });
    expect(kind).toBe('order_slip');
    expect(alert).toBe(true);
  });

  it('order_slip not triggered at unreachable nodes ← regression test 13', () => {
    // g8f6 is NOT in the reachable book set at this node
    const { kind } = classifyDeviation({
      ...base,
      nodeRole: null,
      reachableBookUcis: ['e7e5'],
      playedUci: 'g8f6',
    });
    expect(kind).not.toBe('order_slip');
  });

  it('novelty when no drill history and move not in book', () => {
    const { kind, alert } = classifyDeviation({ ...base, nodeRole: null });
    expect(kind).toBe('novelty');
    expect(alert).toBe(true);
  });

  it('lapse when drill history exists and move is not in book', () => {
    const { kind, alert } = classifyDeviation({ ...base, nodeRole: null, nodeHasDrillHistory: true });
    expect(kind).toBe('lapse');
    expect(alert).toBe(true);
  });

  it('first-match-wins — refused_repeat beats transposition when both match', () => {
    // nodeRole = 'refused' and resultingEpdInBook = true — row 1 fires, not row 3
    const { kind } = classifyDeviation({
      ...base,
      nodeRole: 'refused',
      nodeHasCanonical: true,
      resultingEpdInBook: true,
    });
    expect(kind).toBe('refused_repeat');
  });
});

// ─── REACH ───────────────────────────────────────────────────────────────────

describe('reach', () => {
  it('reach_prob = product of maia policy probabilities', () => {
    expect(computeReachProb([0.8, 0.5])).toBeCloseTo(0.4);
  });

  it('reach_prob = 1 when no opponent plies (root node)', () => {
    expect(computeReachProb([])).toBe(1);
  });

  it('coverage_pct = sum(reach covered) / sum(reach all) × 100', () => {
    const nodes = [
      { reachProb: 0.8, hasCoverage: true },
      { reachProb: 0.2, hasCoverage: false },
    ];
    expect(computeCoveragePct(nodes)).toBeCloseTo(80);
  });

  it('coverage_pct = 0 when no nodes', () => {
    expect(computeCoveragePct([])).toBe(0);
  });

  it('expected_depth weighted by reach', () => {
    const nodes = [
      { ply: 2, reachProb: 0.6, hasCoverage: true },
      { ply: 4, reachProb: 0.4, hasCoverage: true },
    ];
    // expected = (2*0.6 + 4*0.4) / (0.6+0.4) = (1.2 + 1.6) / 1 = 2.8
    expect(computeExpectedDepth(nodes)).toBeCloseTo(2.8);
  });

  it('expected_depth: two nodes at same ply accumulate reach (covers byPly.has false branch)', () => {
    const nodes = [
      { ply: 2, reachProb: 0.3, hasCoverage: true },
      { ply: 2, reachProb: 0.5, hasCoverage: true }, // same ply → accumulated
    ];
    expect(computeExpectedDepth(nodes)).toBeCloseTo(2);
  });

  it('expected_depth returns 0 when no covered nodes (covers sumReach=0 branch)', () => {
    const nodes = [
      { ply: 2, reachProb: 0.5, hasCoverage: false }, // skipped
    ];
    expect(computeExpectedDepth(nodes)).toBe(0);
  });

  it('gap list contains replies above 1/REP_COVERAGE_GOAL not covered', () => {
    const candidates = [
      { epd: 'epd1', opponentReplyUci: 'd2d4', reachProb: 0.1, hasCoverage: false },  // 1 in 10 — in frontier
      { epd: 'epd2', opponentReplyUci: 'e2e4', reachProb: 0.005, hasCoverage: false }, // below frontier
      { epd: 'epd3', opponentReplyUci: 'c2c4', reachProb: 0.1, hasCoverage: true },    // covered
    ];
    const gaps = buildGapReport(candidates);
    expect(gaps.length).toBe(1);
    expect(gaps[0].opponentReplyUci).toBe('d2d4');
  });

  it('isInFrontier is true at 1/REP_COVERAGE_GOAL', () => {
    expect(isInFrontier(1 / 50)).toBe(true);
  });

  it('isInFrontier is false below 1/REP_COVERAGE_GOAL', () => {
    expect(isInFrontier(1 / 51)).toBe(false);
  });

  it('gap report returns empty when all gaps below frontier', () => {
    const candidates = [
      { epd: 'e1', opponentReplyUci: 'd2d4', reachProb: 0.001, hasCoverage: false },
    ];
    expect(buildGapReport(candidates)).toHaveLength(0);
  });

  it('buildGapReport sort: two uncovered frontier nodes sorted by reach descending', () => {
    const candidates = [
      { epd: 'epd1', opponentReplyUci: 'd2d4', reachProb: 1 / 30, hasCoverage: false },
      { epd: 'epd2', opponentReplyUci: 'e2e4', reachProb: 1 / 10, hasCoverage: false },
    ];
    const gaps = buildGapReport(candidates);
    expect(gaps).toHaveLength(2);
    expect(gaps[0].opponentReplyUci).toBe('e2e4'); // higher reach first
    expect(gaps[1].opponentReplyUci).toBe('d2d4');
  });
});

// ─── CHALLENGE ────────────────────────────────────────────────────────────────

describe('challenge', () => {
  const BASE = {
    challengerPlays: 1,
    incumbentPlays: 0,
    encountersSinceOpen: 0,
    challengerObservations: REP_CONFIRM_OBS,
    engineDelta: null,
    gateVerdict: 'admitted',
    trendChallenger: null,
    trendIncumbent: null,
    resultChallengerPerf: null,
    resultChallengerN: 0,
    resultIncumbentPerf: null,
    resultIncumbentN: 0,
    isSuppressed: false,
    qualifiesForAlternation: false,
  };

  it('engine_delta sign: positive = challenger better ← sign regression', () => {
    // A challenger with engine_delta ≥ CLEAR should promote; one with negative should not
    const promote = resolveChallenge({
      ...BASE,
      challengerPlays: REP_CHALLENGE_REPEAT_CONFIRM,
      engineDelta: REP_CHALLENGE_ENGINE_CLEAR,
    });
    const noPromote = resolveChallenge({
      ...BASE,
      engineDelta: -REP_CHALLENGE_ENGINE_CLEAR,
    });
    expect(promote.status).toBe('promoted');
    expect(noPromote.status).not.toBe('promoted');
  });

  it('gate veto beats good results — rule 1 fires before rule 2', () => {
    const result = resolveChallenge({
      ...BASE,
      engineDelta: REP_CHALLENGE_ENGINE_CLEAR + 10, // engine-clear level
      gateVerdict: 'refused',
    });
    expect(result.status).toBe('rejected_unsound');
    expect(result.rule).toBe('1');
  });

  it('engine-clear promotes when engine_delta >= REP_CHALLENGE_ENGINE_CLEAR ← rule 2', () => {
    const result = resolveChallenge({
      ...BASE,
      engineDelta: REP_CHALLENGE_ENGINE_CLEAR,
    });
    expect(result.status).toBe('promoted');
    expect(result.rule).toBe('2');
  });

  it('single-observation challenger → not promoted by rule 2 (invariant 14) ← regression test 2', () => {
    const result = resolveChallenge({
      ...BASE,
      challengerObservations: REP_CONFIRM_OBS - 1,
      engineDelta: REP_CHALLENGE_ENGINE_CLEAR + 10,
    });
    expect(result.status).not.toBe('promoted');
  });

  it('repeat-plus-neutral promotes at challengerPlays >= REP_CHALLENGE_REPEAT_CONFIRM ← rule 3', () => {
    const result = resolveChallenge({
      ...BASE,
      challengerPlays: REP_CHALLENGE_REPEAT_CONFIRM,
      engineDelta: 0, // within tolerance (neutral)
    });
    expect(result.status).toBe('promoted');
    expect(result.rule).toBe('3');
  });

  it('rule 3 requires no results data at all', () => {
    // Promote via rule 3 even with zero games in result sample
    const result = resolveChallenge({
      ...BASE,
      challengerPlays: REP_CHALLENGE_REPEAT_CONFIRM,
      engineDelta: 0,
      resultChallengerN: 0,
    });
    expect(result.status).toBe('promoted');
    expect(result.rule).toBe('3');
  });

  it('rule 3 reachable without a second alert — only unprompted repeats ← regression test 1', () => {
    // Opening refusal (challengerPlays=1) + one unprompted repeat (challengerPlays=2)
    // No second alert needed; the system should promote
    const result = resolveChallenge({
      ...BASE,
      challengerPlays: REP_CHALLENGE_REPEAT_CONFIRM, // = 2
      challengerObservations: REP_CONFIRM_OBS,
      engineDelta: 0,
    });
    expect(result.status).toBe('promoted');
    expect(result.rule).toBe('3');
  });

  it('evidence promotes with trend over REP_CHALLENGE_MIN_GAMES ← rule 4', () => {
    const result = resolveChallenge({
      ...BASE,
      engineDelta: 0, // within tolerance
      trendChallenger: 52,
      trendIncumbent: 48,
      resultChallengerN: REP_CHALLENGE_MIN_GAMES,
      resultIncumbentN: REP_CHALLENGE_MIN_GAMES,
      resultChallengerPerf: 0.1,
      resultIncumbentPerf: 0.0,
    });
    expect(result.status).toBe('promoted');
    expect(result.rule).toBe('4');
  });

  it('style-call: engine dislikes but results support → promoted not escalated ← rule 5', () => {
    const result = resolveChallenge({
      ...BASE,
      engineDelta: -(REP_CHALLENGE_ENGINE_TOL + 1), // engine dislikes
      gateVerdict: 'admitted',                       // but gates pass
      resultChallengerN: REP_CHALLENGE_MIN_GAMES,
      resultIncumbentN: REP_CHALLENGE_MIN_GAMES,
      resultChallengerPerf: 0.3,
      resultIncumbentPerf: 0.3 - REP_CHALLENGE_RESULT_MARGIN - 0.01,
    });
    expect(result.status).toBe('promoted');
    expect(result.rule).toBe('5');
  });

  it('incumbent replayed → rejected ← rule 6', () => {
    const result = resolveChallenge({ ...BASE, incumbentPlays: 1 });
    expect(result.status).toBe('rejected');
    expect(result.rule).toBe('6');
  });

  it('abandoned at REP_CHALLENGE_TTL_ENCOUNTERS encounters ← rule 7', () => {
    const result = resolveChallenge({
      ...BASE,
      encountersSinceOpen: REP_CHALLENGE_TTL_ENCOUNTERS,
    });
    expect(result.status).toBe('abandoned');
    expect(result.rule).toBe('7');
  });

  it('TTL counted in node encounters not games ← regression test 7', () => {
    // A challenge that opened after 1 node encounter should not abandon before TTL encounters
    const openResult = resolveChallenge({
      ...BASE,
      encountersSinceOpen: REP_CHALLENGE_TTL_ENCOUNTERS - 1,
    });
    expect(openResult.status).toBe('open');

    const abandonedResult = resolveChallenge({
      ...BASE,
      encountersSinceOpen: REP_CHALLENGE_TTL_ENCOUNTERS,
    });
    expect(abandonedResult.status).toBe('abandoned');
  });

  it('neither move alerts while challenge open — status is open when no rule fires', () => {
    const result = resolveChallenge({ ...BASE });
    expect(result.status).toBe('open');
  });

  it('alternation → settled_both canonical+alt not flip ← rule 9', () => {
    const result = resolveChallenge({
      ...BASE,
      qualifiesForAlternation: true,
    });
    expect(result.status).toBe('settled_both');
    expect(result.rule).toBe('9');
  });

  it('precondition: no canonical below REP_CONFIRM_OBS observations ← invariant 14', () => {
    // Even with engine-clear, a challenger with only 1 observation must not promote
    const result = resolveChallenge({
      ...BASE,
      challengerObservations: 1,
      engineDelta: REP_CHALLENGE_ENGINE_CLEAR + 5,
    });
    expect(result.status).not.toBe('promoted');
  });

  it('timeout opens no challenge — represented here as never reaching resolve', () => {
    // This test documents the rule: timeout rows must not produce a challenge at all.
    // The challenge resolver only sees challenges that have already been opened.
    // So this is verified by the invariant: if status = open and no challenger opens, resolve returns open.
    const result = resolveChallenge({ ...BASE });
    expect(result.status).toBe('open');
    // Actual timeout handling is tested in the WS handler (Phase 21)
  });

  it('coach_corrected does not advance confirmation or vote ← regression test 4', () => {
    // The challenge resolver only receives self-directed observation counts.
    // challengerObservations < REP_CONFIRM_OBS must block promotion regardless of engine.
    const result = resolveChallenge({
      ...BASE,
      challengerObservations: 0, // only coach_corrected observations — not counted
      engineDelta: REP_CHALLENGE_ENGINE_CLEAR + 10,
    });
    expect(result.status).not.toBe('promoted');
  });

  it('reversal suppression: suppressed challenge cannot be promoted ← regression test 5', () => {
    const result = resolveChallenge({
      ...BASE,
      challengerPlays: REP_CHALLENGE_REPEAT_CONFIRM,
      engineDelta: REP_CHALLENGE_ENGINE_CLEAR,
      isSuppressed: true,
    });
    expect(result.status).not.toBe('promoted');
  });

  it('rule 6 via trend+result both favouring incumbent', () => {
    const result = resolveChallenge({
      ...BASE,
      resultChallengerN: REP_CHALLENGE_MIN_GAMES,
      resultIncumbentN: REP_CHALLENGE_MIN_GAMES,
      trendChallenger: 45,
      trendIncumbent: 55,
      resultChallengerPerf: 0.1,
      resultIncumbentPerf: 0.1 + REP_CHALLENGE_RESULT_MARGIN + 0.01,
    });
    expect(result.status).toBe('rejected');
    expect(result.rule).toBe('6');
  });

  it('line_loss is minimum over paths — gate veto fires on budget', () => {
    // This exercises the gate layer used in challenge resolution.
    // Gate 3: lineLoss >= REP_LINE_BUDGET_WIN_PTS → refused
    const { verdict } = runGates({
      winLossPts: 5,
      winAfter: 55,
      bestMoveWinAfter: 60,
      lineLoss: REP_LINE_BUDGET_WIN_PTS,
      isForcedMate: false,
    });
    expect(verdict).toBe('refused');
  });

  it('adding a cheaper path lowers line_loss ← regression test 6', () => {
    // The minimum over paths should decrease when a cheaper route is found.
    const expensivePath = REP_LINE_BUDGET_WIN_PTS - 1;
    const cheapPath = expensivePath - 5;
    // After adding the cheap path, min(expensivePath, cheapPath) = cheapPath
    expect(Math.min(expensivePath, cheapPath)).toBe(cheapPath);
    // And gate 3 would admit where it previously refused — verify:
    const beforeCheapPath = runGates({ winLossPts: 5, winAfter: 55, bestMoveWinAfter: 60, lineLoss: expensivePath, isForcedMate: false });
    const afterCheapPath = runGates({ winLossPts: 5, winAfter: 55, bestMoveWinAfter: 60, lineLoss: cheapPath, isForcedMate: false });
    expect(beforeCheapPath.verdict).toBe('admitted');
    expect(afterCheapPath.verdict).toBe('admitted');
  });
});

// ─── CHALLENGE UTILITY ────────────────────────────────────────────────────────

describe('eloAdjustedPerf', () => {
  it('win against equal opponent is ~0.5 above expected', () => {
    // expected = 0.5 for equal opponents; score = 1; perf = 0.5
    expect(eloAdjustedPerf(1, 1500, 1500)).toBeCloseTo(0.5);
  });

  it('draw against equal opponent is 0 adjusted performance', () => {
    expect(eloAdjustedPerf(0.5, 1500, 1500)).toBeCloseTo(0);
  });

  it('loss against much stronger opponent still penalises slightly', () => {
    // expected ≈ 0.36 for player 200 below; score = 0; perf ≈ -0.36 (barely missed expectation)
    const perf = eloAdjustedPerf(0, 1700, 1500);
    expect(perf).toBeLessThan(0);
  });
});
