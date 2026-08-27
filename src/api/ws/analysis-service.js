/**
 * @module api/ws/analysis-service
 * Runs the full analysis pipeline after a game ends.
 * Emits analysis_progress / analysis_done over the WebSocket.
 * Saves move evals, puzzles, FSRS cards, and updates ELO.
 */

import { randomUUID } from 'crypto';

import { runAnalysis } from '../../domain/analysis/pipeline.js';
import { selectPuzzles } from '../../domain/puzzles/select.js';
import { nearestMaiaModel } from '../../domain/analysis/findability.js';
import { updateElo } from '../../domain/game/elo.js';
import { getAvailableOpponents } from '../../domain/game/roster.js';
import { logger } from '../../config.js';

const log = logger.child({ mod: 'analysis-service' });

/**
 * Run post-game analysis and persist all results.
 *
 * @param {object} opts
 * @param {string} opts.gameId
 * @param {object} opts.session — GameSession (for ranked/opponent/playerColor)
 * @param {object} opts.result — { result, termination }
 * @param {import('ws').WebSocket} opts.ws
 * @param {import('../../ports/repositories.js').GameRepository} opts.gameRepo
 * @param {import('../../ports/repositories.js').PuzzleRepository} opts.puzzleRepo
 * @param {import('../../adapters/sqlite/repositories.js').SqliteSettingsRepository} opts.settingsRepo
 * @param {object} opts.enginePool
 */
export async function analyseGame({
  gameId, session, result, ws, gameRepo, puzzleRepo, settingsRepo, enginePool,
}) {
  const { opponent, playerColor, ranked } = session;

  // Mark analysis as running
  gameRepo.save({
    id: gameId,
    opponentId: opponent.id,
    opponentElo: opponent.elo,
    playerColor,
    ranked,
    status: 'finished',
    result: result.result,
    termination: result.termination,
    analysisState: 'running',
    playedAt: Date.now(),
  });

  // Get game moves for analysis
  const moves = gameRepo.getMoves(gameId);
  if (!moves.length) {
    log.warn({ gameId }, 'no moves found for analysis — skipping');
    gameRepo.save({ id: gameId, opponentId: opponent.id, opponentElo: opponent.elo,
      playerColor, ranked, status: 'finished', result: result.result,
      termination: result.termination, analysisState: 'failed' });
    return;
  }

  // Player ELO and maia model selection
  const playerElo = parseInt(settingsRepo.get('elo') ?? '1200', 10);
  const availableOpponents = getAvailableOpponents();
  const availableMaias = availableOpponents.filter(o => o.type === 'maia').map(o => o.id);
  const maiaModel = availableMaias.length
    ? nearestMaiaModel(playerElo, availableMaias)
    : null;

  // Acquire engine clients
  let sfClient, maiaClient;
  try {
    sfClient = await enginePool.getAnalysisSfClient();
    maiaClient = maiaModel ? await enginePool.getMaiaAnalysisClient(maiaModel) : null;
  } catch (err) {
    log.error({ err, gameId }, 'failed to start analysis engines');
    gameRepo.save({ id: gameId, opponentId: opponent.id, opponentElo: opponent.elo,
      playerColor, ranked, status: 'finished', result: result.result,
      termination: result.termination, analysisState: 'failed' });
    _sendIfOpen(ws, { type: 'error', error_code: 'analysis_failed',
      message: 'Analysis engine unavailable', detail: {} });
    return;
  }

  const wasTimed = session._timeControlInitialSec != null;
  const plies = moves.map(m => m.uci);

  try {
    const { moveEvals, accuracy, opponentAccuracy, puzzleCandidates } = await runAnalysis({
      plies,
      playerColor,
      sfClient,
      maiaClient: maiaClient ?? sfClient, // fallback to sf if no maia
      maiaModel: maiaModel ?? 'none',
      playerElo,
      wasTimed,
      onProgress(event) {
        _sendIfOpen(ws, { type: 'analysis_progress', gameId, ...event });
      },
    });

    // Save move evals
    for (const e of moveEvals) {
      gameRepo.saveMoveEval({ ...e, gameId });
    }

    // Select puzzles
    const selected = selectPuzzles(puzzleCandidates, { wasTimed, playerElo });

    // Save puzzles and init FSRS cards
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    for (const p of selected) {
      const altLines = p.altMovesJson ? JSON.parse(p.altMovesJson) : [];
      const acceptedMoves = [p.bestMoveUci, ...altLines.map(a => a.uci).filter(Boolean)];

      const puzzleId = puzzleRepo.save({
        fen: p.fen,
        sideToMove: playerColor === 'white' ? 'white' : 'black',
        bestMoveUci: p.bestMoveUci,
        pv: p.pv ?? null,
        acceptedMovesJson: JSON.stringify([...new Set(acceptedMoves)]),
        followupUci: p.pv ? p.pv.split(' ')[1] ?? null : null,
        playedMoveUci: p.moveUci,
        cpLoss: p.cpLoss,
        winLossPts: p.winLoss,
        classification: p.classification,
        findability: p.findability,
        temptation: p.temptation,
        instructiveness: p.instructiveness,
        tags: p.tags ?? '',
        maiaModel: p.maiaModel,
        policyTemperature: p.policyTemperature ?? 1.0,
        eloAtCreation: playerElo,
        sourceGameId: gameId,
        sourcePly: p.ply,
        phase: p.phase,
        wasTimed: wasTimed ? 1 : 0,
      });

      // Init FSRS card with due = tomorrow (post-game quiz creates it, not schedules it)
      puzzleRepo.saveCard({
        puzzleId,
        due: tomorrow,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        lastReview: null,
        graduated: 0,
      });
    }

    // Update ELO if ranked game with a known opponent ELO
    let eloBefore = null;
    let eloAfter = null;
    if (ranked && opponent.elo != null) {
      const gamesPlayed = gameRepo.getEloHistory().length;
      const score = result.result === 'win' ? 1 : result.result === 'draw' ? 0.5 : 0;
      const { newElo } = updateElo({ myElo: playerElo, oppElo: opponent.elo, score, gamesPlayed });
      eloBefore = playerElo;
      eloAfter = newElo;
      gameRepo.updateElo(gameId, {
        eloBefore,
        eloAfter,
        historyId: randomUUID(),
        recordedAt: Date.now(),
      });
    }

    // Update game with analysis results
    gameRepo.save({
      id: gameId,
      opponentId: opponent.id,
      opponentElo: opponent.elo,
      playerColor,
      ranked,
      status: 'finished',
      result: result.result,
      termination: result.termination,
      accuracy,
      opponentAccuracy,
      analysisState: 'done',
      analysedAt: Date.now(),
      eloBefore,
      eloAfter,
      playedAt: Date.now(),
    });

    // Re-send game_over with ELO if it changed
    if (eloBefore != null) {
      _sendIfOpen(ws, {
        type: 'game_over',
        result: result.result,
        termination: result.termination,
        eloBefore,
        eloAfter,
      });
    }

    _sendIfOpen(ws, {
      type: 'analysis_done',
      gameId,
      puzzleCount: selected.length,
    });

    log.info({ gameId, puzzles: selected.length, accuracy }, 'analysis complete');
  } catch (err) {
    log.error({ err, gameId }, 'analysis failed');
    gameRepo.save({ id: gameId, opponentId: opponent.id, opponentElo: opponent.elo,
      playerColor, ranked, status: 'finished', result: result.result,
      termination: result.termination, analysisState: 'failed' });
    _sendIfOpen(ws, { type: 'error', error_code: 'analysis_failed',
      message: `Analysis failed: ${err.message}`, detail: {} });
  }
}

function _sendIfOpen(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}
