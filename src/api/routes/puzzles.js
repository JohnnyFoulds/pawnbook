/**
 * @module api/routes/puzzles
 * GET  /api/puzzles/due          — due cards for the drill screen
 * GET  /api/puzzles/practice     — not-yet-due cards for drill-ahead (practice=1)
 * POST /api/puzzles/:id/attempt  — grade an attempt and schedule
 */

import { Router } from 'express';
import { z } from 'zod';

import { gradeAttempt } from '../../domain/puzzles/attempt.js';
import { sortDueCards, formatDueCount } from '../../domain/review/queue.js';
import { DUE_SOFT_CAP, DRILL_BATCH } from '../../shared/balance.js';
import { logger } from '../../config.js';

const log = logger.child({ mod: 'puzzles-route' });

const AttemptSchema = z.object({
  move: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
  msTaken: z.number().int().min(0),
  hintUsed: z.boolean().default(false),
  attemptNo: z.number().int().min(1).max(2).default(1),
  phase: z.enum(['quiz', 'drill']).default('drill'),
});

/**
 * @param {object} deps
 * @param {import('../../ports/repositories.js').PuzzleRepository} deps.puzzleRepo
 * @param {import('../../ports/scheduler.js').Scheduler} deps.scheduler
 * @param {import('../../ports/clock.js').Clock} deps.clock
 * @param {import('../../ports/repositories.js').SettingsRepository} deps.settingsRepo
 * @returns {Router}
 */
export function puzzlesRouter({ puzzleRepo, scheduler, clock, settingsRepo: _settingsRepo }) {
  const router = Router();

  router.get('/due', (req, res, next) => {
    try {
      const now = clock.now().getTime();
      const allDue = puzzleRepo.getDueCards(now);
      const { overCap } = formatDueCount(allDue.length);
      const sorted = sortDueCards(allDue, clock.now());
      const cards = sorted.slice(0, DRILL_BATCH);

      res.json({
        cards: cards.map(formatCard),
        total: allDue.length,
        displayTotal: overCap ? `${DUE_SOFT_CAP}+` : String(allDue.length),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/practice', (req, res, next) => {
    try {
      const now = clock.now().getTime();
      const all = puzzleRepo.getPracticeCards?.(now) ?? [];
      const cards = all.slice(0, DRILL_BATCH);
      res.json({
        cards: cards.map(formatCard),
        total: all.length,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/attempt', async (req, res, next) => {
    try {
      const parsed = AttemptSchema.parse(req.body);
      const puzzle = puzzleRepo.findById(req.params.id);

      const isPractice = parsed.phase === 'quiz';

      // Determine if this is the first spaced review (reps === 0 and not practice)
      const card = puzzleRepo.getCard(req.params.id);
      const isFirstSpacedReview = !isPractice && (card?.reps ?? 0) === 0;

      const verdict = gradeAttempt(puzzle, {
        move: parsed.move,
        msTaken: parsed.msTaken,
        hintUsed: parsed.hintUsed,
        attemptNo: parsed.attemptNo,
        isPractice,
        isFirstSpacedReview,
      });

      // Schedule the card unless it is a practice attempt
      if (!isPractice && verdict.rating) {
        const now = clock.now();
        const { card: newCard } = scheduler.schedule(card ?? scheduler.newCard?.() ?? {}, verdict.rating, now);
        puzzleRepo.saveCard({ puzzleId: req.params.id, ...newCard });
      } else if (isPractice && !card) {
        // Post-game quiz: create the card with due = tomorrow
        const tomorrow = new Date(clock.now().getTime() + 86_400_000);
        puzzleRepo.saveCard({
          puzzleId: req.params.id,
          due: tomorrow.getTime(),
          reps: 0,
          lapses: 0,
          graduated: false,
        });
      }

      // Write review row
      const reviewData = {
        puzzleId: req.params.id,
        correct: verdict.correct,
        rating: verdict.rating,
        msTaken: parsed.msTaken,
        attemptedMoveUci: parsed.move,
        attemptNo: parsed.attemptNo,
        practice: isPractice ? 1 : 0,
        suspectRecall: verdict.suspectRecall ? 1 : 0,
        reviewedAt: clock.now().getTime(),
      };

      try {
        puzzleRepo.saveReview(reviewData);
      } catch (err) {
        log.warn({ err, puzzleId: req.params.id }, 'failed to save review row — verdict still returned');
      }

      // Current card state after scheduling (for nextDue)
      const updatedCard = puzzleRepo.getCard(req.params.id);

      res.json({
        correct: verdict.correct,
        rating: verdict.rating,
        followupRequired: verdict.followupRequired,
        suspectRecall: verdict.suspectRecall,
        bestMoveSan: puzzle.bestMoveSan ?? puzzle.best_move_san ?? null,
        pv: puzzle.pv ?? null,
        winLoss: puzzle.winLossPts ?? puzzle.win_loss_pts ?? null,
        nextDue: updatedCard?.due ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function formatCard(row) {
  const uci = row.best_move_uci ?? row.bestMoveUci ?? '';
  return {
    puzzleId: row.id,
    fen: row.fen,
    sideToMove: row.side_to_move ?? row.sideToMove,
    bestMoveUci: uci,
    bestMoveSan: row.best_move_san ?? row.bestMoveSan,
    playedMoveSan: row.played_move_san ?? row.playedMoveSan,
    followupUci: row.followup_uci ?? row.followupUci ?? null,
    winLoss: row.win_loss_pts ?? row.winLossPts,
    piece: pieceAtSquare(row.fen ?? '', uci.slice(0, 2)),
    legalMoves: [],  // populated from chess.js if needed; TUI uses move validation server-side
    ply: row.source_ply ?? row.sourcePly,
    sourceGameId: row.source_game_id ?? row.sourceGameId ?? null,
    kind: row.kind ?? null,
    motifTag: row.motif_tag ?? row.motifTag ?? null,
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
