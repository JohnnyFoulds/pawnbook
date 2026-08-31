/**
 * @module domain/puzzles/dedupe
 * Puzzle deduplication: bump times_seen on repeated FENs and recompute
 * findability when the Maia model changes.
 */

import { probeFindability } from '../analysis/findability.js';
import { logger } from '../../config.js';

const log = logger.child({ mod: 'dedupe' });

/**
 * Save a puzzle, bumping times_seen if the FEN+kind already exists.
 * When the stored Maia model differs from the new candidate's model and a
 * maiaClient is available, findability is re-probed and the row updated.
 *
 * @param {object} opts
 * @param {object} opts.puzzle — puzzle candidate from selectPuzzles()
 * @param {object} opts.puzzleRepo — PuzzleRepository instance
 * @param {object|null} opts.maiaClient — lc0 engine client; null skips recompute
 * @returns {Promise<{ id: string, recomputed: boolean, oldMaiaModel?: string, newMaiaModel?: string }>}
 */
export async function dedupeAndSave({ puzzle, puzzleRepo, maiaClient }) {
  const kind = puzzle.kind ?? 'tactical';

  // Snapshot existing row before save (save only bumps times_seen, not other fields)
  const existing = puzzleRepo.getByFenAndKind(puzzle.fen, kind);
  const id = puzzleRepo.save(puzzle);

  if (!existing || !maiaClient) return { id, recomputed: false };

  // Handle both camelCase (memory adapter) and snake_case (SQLite adapter) field names
  const oldMaiaModel = existing.maiaModel ?? existing.maia_model ?? null;
  const newMaiaModel = puzzle.maiaModel ?? null;

  if (!oldMaiaModel || !newMaiaModel || oldMaiaModel === newMaiaModel) {
    return { id, recomputed: false };
  }

  log.info({ puzzleId: id, oldMaiaModel, newMaiaModel }, 'maia_model changed — recomputing findability');

  const bestMoveUci = existing.bestMoveUci ?? existing.best_move_uci;
  const playedMoveUci = existing.playedMoveUci ?? existing.played_move_uci;
  const winLossPts = existing.winLossPts ?? existing.win_loss_pts ?? 0;

  const { findability, temptation, instructiveness } = await probeFindability({
    maiaClient,
    fen: puzzle.fen,
    bestMoveUci,
    playedMoveUci,
    winLossPts,
    maiaModel: newMaiaModel,
  });

  puzzleRepo.updateFindability(id, {
    findability,
    temptation,
    instructiveness,
    maiaModel: newMaiaModel,
    policyTemperature: puzzle.policyTemperature ?? 1.0,
  });

  return { id, recomputed: true, oldMaiaModel, newMaiaModel };
}
