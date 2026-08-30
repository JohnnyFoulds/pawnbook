/**
 * @module api/routes/games
 * GET  /api/games               — game list
 * GET  /api/games/:id/review    — move evals + accuracy for review page
 * GET  /api/games/:id/quiz      — ordered puzzle positions for quiz
 * POST /api/games/:id/analyse   — re-trigger analysis for a failed/pending game
 */

import { Router } from 'express';

import { analyseGame } from '../ws/analysis-service.js';
import { getOpponent } from '../../domain/game/roster.js';
import {
  STRENGTH_ANCHOR_ELO, STRENGTH_ANCHOR_ASE, STRENGTH_ELO_PER_ASE,
  STRENGTH_ELO_MIN, STRENGTH_ELO_MAX, STRENGTH_MIN_PLIES, STRENGTH_ROLLING_N,
} from '../../shared/balance.js';

const _nullWs = { readyState: 0, send() {} }; // no-op WS for REST-triggered analysis

/**
 * @param {object} deps
 * @param {import('../../ports/repositories.js').GameRepository} deps.gameRepo
 * @param {import('../../ports/repositories.js').PuzzleRepository} deps.puzzleRepo
 * @param {import('../../adapters/sqlite/repositories.js').SqliteSettingsRepository} [deps.settingsRepo]
 * @param {object} [deps.enginePool]
 * @returns {Router}
 */
export function gamesRouter({ gameRepo, puzzleRepo, settingsRepo, enginePool }) {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const games = gameRepo.listRecent(50);
      const puzzleCountsByGame = puzzleRepo.getPuzzleCountsByGameId?.() ?? {};
      res.json({
        games: games.map((g) => ({ ...g, puzzleCount: puzzleCountsByGame[g.id] ?? 0 })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/review', (req, res, next) => {
    try {
      const game = gameRepo.findById(req.params.id);
      const evals = gameRepo.getEvals(req.params.id);
      const puzzles = puzzleRepo.listByGame(req.params.id);

      // Strength SEs — recomputed from stored sufficient statistics (never stored, to stay refit-safe)
      const allSamples = [
        ...gameRepo.listStrengthSamples({ side: 'player' }),
        ...gameRepo.listStrengthSamples({ side: 'opponent' }),
      ];
      const playerSample = allSamples.find(s => s.gameId === game.id && s.side === 'player');
      const opponentSample = allSamples.find(s => s.gameId === game.id && s.side === 'opponent');
      const strengthSe = playerSample && playerSample.n >= STRENGTH_MIN_PLIES
        ? Math.round(STRENGTH_ELO_PER_ASE * playerSample.sd / Math.sqrt(playerSample.n))
        : null;
      const opponentStrengthSe = opponentSample && opponentSample.n >= STRENGTH_MIN_PLIES
        ? Math.round(STRENGTH_ELO_PER_ASE * opponentSample.sd / Math.sqrt(opponentSample.n))
        : null;

      // Rolling inverse-variance aggregate over the last STRENGTH_ROLLING_N player samples
      const rollingRaw = gameRepo.listStrengthSamples({ side: 'player', limit: STRENGTH_ROLLING_N });
      const rollingEligible = rollingRaw.filter(r => r.n >= STRENGTH_MIN_PLIES);
      let rollingStrength = null;
      let rollingSe = null;
      if (rollingEligible.length > 0) {
        const pairs = rollingEligible.map(r => {
          const elo = Math.round(Math.max(STRENGTH_ELO_MIN, Math.min(STRENGTH_ELO_MAX,
            STRENGTH_ANCHOR_ELO - STRENGTH_ELO_PER_ASE * (r.ase - STRENGTH_ANCHOR_ASE))));
          const se = Math.max(1, Math.round(STRENGTH_ELO_PER_ASE * r.sd / Math.sqrt(r.n)));
          return { elo, se };
        });
        const sumWeights = pairs.reduce((s, p) => s + 1 / (p.se * p.se), 0);
        const sumWeightedElo = pairs.reduce((s, p) => s + p.elo / (p.se * p.se), 0);
        rollingStrength = Math.round(sumWeightedElo / sumWeights);
        rollingSe = Math.round(1 / Math.sqrt(sumWeights));
      }

      const moves = evals.map((r) => ({
        ply: r.ply,
        san: r.move_san,
        uci: r.move_uci,
        fen: r.fen,
        mover: r.mover,
        winPct: r.win_after ?? r.win_before ?? 50,
        classification: r.classification ?? null,
        cpLoss: r.cp_loss ?? null,
      }));

      const mistakes = puzzles.map((p) => {
        const tags = typeof p.tags === 'string' && p.tags
          ? p.tags.split(',').map(t => t.trim()).filter(Boolean)
          : [];
        return {
          classification: p.classification,
          moveSan: p.played_move_san,
          winLoss: p.win_loss_pts,
          tags,
          bestMoveSan: p.best_move_san,
          findability: p.findability,
          maiaNearestModel: p.maia_model ?? null,
          engineOnly: tags.includes('engine_only'),
          sourcePly: p.source_ply,
        };
      });

      res.json({
        id: game.id,
        analysisState: game.analysisState,
        analysisError: game.analysisError ?? null,
        opponentId: game.opponentId,
        playerColor: game.playerColor,
        result: game.result,
        termination: game.termination,
        accuracy: game.accuracy,
        opponentAccuracy: game.opponentAccuracy,
        strengthElo: game.strengthElo ?? null,
        opponentStrengthElo: game.opponentStrengthElo ?? null,
        strengthSe,
        opponentStrengthSe,
        rollingStrength,
        rollingSe,
        eloBefore: game.eloBefore,
        eloAfter: game.eloAfter,
        moves,
        mistakes,
        puzzleCount: puzzles.length,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/quiz', (req, res, next) => {
    try {
      const game = gameRepo.findById(req.params.id);
      const puzzles = puzzleRepo.listByGame(req.params.id);
      // Exclude engine_only puzzles from the quiz (they are shown in review but not drilled)
      const drillable = puzzles.filter(p => {
        const tags = typeof p.tags === 'string' ? p.tags.split(',') : [];
        return !tags.includes('engine_only');
      });
      const positions = drillable
        .sort((a, b) => (a.source_ply ?? 0) - (b.source_ply ?? 0))
        .map(formatQuizPosition);
      res.json({ positions, opponentId: game.opponentId });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/analyse', (req, res, next) => {
    try {
      const game = gameRepo.findById(req.params.id);
      if (game.status !== 'finished') {
        return res.status(409).json({ error_code: 'game_not_finished', message: 'Game is not finished' });
      }
      if (!enginePool) {
        return res.status(503).json({ error_code: 'engine_unavailable', message: 'Engine pool not available' });
      }
      // Build a minimal session-like object from stored game data
      const opponent = getOpponent(game.opponentId);
      const session = {
        opponent,
        playerColor: game.playerColor,
        ranked: game.ranked,
        _timeControlInitialSec: game.timeControlInitialSec,
      };
      const result = { result: game.result, termination: game.termination };
      // Fire-and-forget — analysis runs in background
      analyseGame({ gameId: game.id, session, result, ws: _nullWs, gameRepo, puzzleRepo, settingsRepo, enginePool })
        .catch(() => {});
      res.status(202).json({ ok: true, message: 'Analysis started' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function formatQuizPosition(row) {
  const uci = row.best_move_uci ?? row.bestMoveUci ?? '';
  return {
    puzzleId: row.id,
    fen: row.fen,
    sideToMove: row.side_to_move ?? row.sideToMove,
    playedMoveSan: row.played_move_san ?? row.playedMoveSan,
    bestMoveUci: uci,
    bestMoveSan: row.best_move_san ?? row.bestMoveSan,
    pv: row.pv ?? null,
    followupUci: row.followup_uci ?? row.followupUci ?? null,
    acceptedMovesJson: row.accepted_moves_json ?? row.acceptedMovesJson ?? null,
    winLoss: row.win_loss_pts ?? row.winLossPts,
    piece: pieceAtSquare(row.fen ?? '', uci.slice(0, 2)),
    ply: row.source_ply ?? row.sourcePly,
    classification: row.classification,
  };
}

function pieceAtSquare(fen, square) {
  if (!fen || !square || square.length < 2) return '?';
  const board = fen.split(' ')[0];
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  const rowIdx = 7 - rank;
  const rows = board.split('/');
  if (rowIdx < 0 || rowIdx >= rows.length) return '?';
  const names = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
  let col = 0;
  for (const ch of rows[rowIdx]) {
    if (ch >= '1' && ch <= '8') {
      col += parseInt(ch, 10);
    } else {
      if (col === file) return names[ch.toLowerCase()] ?? '?';
      col++;
    }
  }
  return '?';
}
