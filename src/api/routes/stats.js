/**
 * @module api/routes/stats
 * GET /api/stats — aggregated stats for the stats page and TUI.
 */

import { Router } from 'express';

import { MOTIF_DIMENSION } from '../../domain/analysis/motif-classifier.js';
import { pickFocusMotif } from '../../domain/review/focus.js';

/**
 * @param {object} deps
 * @param {import('../../ports/repositories.js').GameRepository} deps.gameRepo
 * @param {import('../../ports/repositories.js').PuzzleRepository} deps.puzzleRepo
 * @param {import('../../ports/repositories.js').SettingsRepository} deps.settingsRepo
 * @param {import('../../ports/clock.js').Clock} deps.clock
 * @returns {Router}
 */
export function statsRouter({ gameRepo, puzzleRepo, settingsRepo, clock }) {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const elo = parseInt(settingsRepo.get('elo') ?? '1200', 10);
      const eloHistory = gameRepo.getEloHistory();
      const eloDelta = eloHistory.length >= 2
        ? eloHistory[eloHistory.length - 1].elo - eloHistory[eloHistory.length - 2].elo
        : null;

      const now = clock.now().getTime();
      const allDue = puzzleRepo.getDueCards(now);
      const dueCount = allDue.length;

      // wins / losses / draws from finished ranked games
      const games = gameRepo.listRecent(1000);
      let wins = 0, losses = 0, draws = 0;
      const phaseBreakdown = { opening: 0, middlegame: 0, endgame: 0 };
      for (const g of games) {
        if (g.status !== 'finished') continue;
        if (g.result === 'win') wins++;
        else if (g.result === 'loss') losses++;
        else if (g.result === 'draw') draws++;
      }

      // Phase breakdown from puzzles
      const allPuzzles = puzzleRepo.listAll ? puzzleRepo.listAll() : [];
      let activeCount = 0, graduatedCount = 0;
      for (const p of allPuzzles) {
        if (p.graduated) graduatedCount++;
        else activeCount++;
        if (p.phase && phaseBreakdown[p.phase] !== undefined) {
          phaseBreakdown[p.phase]++;
        }
      }

      // Per-game history for date-range filtering of wins/losses/draws
      const gameHistory = games
        .filter(g => g.status === 'finished')
        .map(g => ({ result: g.result, playedAt: g.playedAt }));

      // Per-puzzle arrays for date-range filtering of phase bars
      const mistakesByPhase = allPuzzles.map(p => ({
        phase: p.phase,
        createdAt: p.created_at ?? p.createdAt ?? null,
      }));

      // Motif breakdown — aggregate motif_tag counts across all puzzles
      const motifBreakdown = {};
      const mistakesByMotif = [];
      for (const p of allPuzzles) {
        const tag = p.motif_tag ?? p.motifTag ?? null;
        if (!tag) continue;
        motifBreakdown[tag] = (motifBreakdown[tag] || 0) + 1;
        mistakesByMotif.push({ motifTag: tag, createdAt: p.created_at ?? p.createdAt ?? null });
      }

      // Dimension breakdown — roll up motifs into skill dimensions
      const dimensionBreakdown = {};
      for (const [tag, n] of Object.entries(motifBreakdown)) {
        const dim = MOTIF_DIMENSION[tag];
        if (dim) dimensionBreakdown[dim] = (dimensionBreakdown[dim] || 0) + n;
      }

      // Rolling style score — geometric mean probability (%) over last 10 games with maia3LogProb
      const styleGames = games
        .filter(g => g.status === 'finished' && g.maia3LogProb != null)
        .slice(0, 10);
      const rollingStyleScore = styleGames.length > 0
        ? Math.round(100 * styleGames.reduce((s, g) => s + Math.exp(g.maia3LogProb), 0) / styleGames.length)
        : null;

      // Quality mix from move_evals (all 7 tiers across all player moves)
      const moveClassifications = gameRepo.getPlayerMoveClassifications?.() ?? [];
      const qualityMix = {};
      for (const m of moveClassifications) {
        qualityMix[m.classification] = (qualityMix[m.classification] || 0) + 1;
      }
      const allMoves = moveClassifications.map(m => ({
        classification: m.classification,
        createdAt: m.played_at,
      }));

      // Per-motif drill accuracy — first-attempt non-practice reviews
      const motifAccuracy = {};
      for (const row of (puzzleRepo.getMotifDrillAccuracy?.() ?? [])) {
        motifAccuracy[row.motifTag] = { total: row.total, correct: row.correct };
      }

      const drillHistory = puzzleRepo.getDrillAccuracyHistory?.() ?? [];

      res.json({
        elo,
        eloDelta,
        eloHistory: eloHistory.map(h => ({ elo: h.elo, recordedAt: h.recordedAt })),
        dueCount,
        activeCount,
        graduatedCount,
        wins,
        losses,
        draws,
        phaseBreakdown,
        gameHistory,
        mistakesByPhase,
        qualityMix,
        allMoves,
        motifBreakdown,
        mistakesByMotif,
        dimensionBreakdown,
        rollingStyleScore,
        motifAccuracy,
        drillHistory,
        focusMotif: pickFocusMotif(motifBreakdown, motifAccuracy),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
