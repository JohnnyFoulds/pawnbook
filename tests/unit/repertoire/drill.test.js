/**
 * Tests for Phase 23: opening card creation and drill integration.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryRepertoireRepository, InMemoryPuzzleRepository } from '../../../src/adapters/memory/repositories.js';
import { _ensureOpeningCards } from '../../../src/api/ws/repertoire-service.js';

function makeRepertoire() {
  return new InMemoryRepertoireRepository();
}

function makePuzzles() {
  return new InMemoryPuzzleRepository();
}

describe('_ensureOpeningCards', () => {
  it('creates an opening puzzle and FSRS card for a canonical node', () => {
    const repRepo = makeRepertoire();
    const puzzleRepo = makePuzzles();

    repRepo.upsertNode({
      epd: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3',
      side: 'white',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      timesReached: 2,
      encounters: 2,
      firstSeen: 1,
      lastSeen: 2,
    });
    repRepo.upsertMove({
      epd: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3',
      side: 'white',
      moveUci: 'e2e4',
      moveSan: 'e4',
      role: 'canonical',
      observations: 2,
    });

    _ensureOpeningCards(repRepo, puzzleRepo);

    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const puzzle = puzzleRepo.getByFenAndKind(fen, 'opening');
    expect(puzzle).not.toBeNull();
    expect(puzzle.kind).toBe('opening');
    expect(puzzle.bestMoveUci).toBe('e2e4');
    expect(puzzle.findability).toBeNull(); // exempted from findability gate

    const card = puzzleRepo.getCard(puzzle.id);
    expect(card).not.toBeNull();
  });

  it('accepted_moves_json includes canonical + alt + challenger but NOT quarantined', () => {
    const repRepo = makeRepertoire();
    const puzzleRepo = makePuzzles();
    const epd = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3';
    const fen = epd + ' 0 1';

    repRepo.upsertNode({ epd, side: 'white', fen, timesReached: 4, encounters: 4, firstSeen: 1, lastSeen: 4 });
    repRepo.upsertMove({ epd, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'canonical', observations: 2 });
    repRepo.upsertMove({ epd, side: 'white', moveUci: 'd2d4', moveSan: 'd4', role: 'alt', observations: 2 });
    repRepo.upsertMove({ epd, side: 'white', moveUci: 'c2c4', moveSan: 'c4', role: 'challenger', observations: 1 });
    repRepo.upsertMove({ epd, side: 'white', moveUci: 'g1f3', moveSan: 'Nf3', role: 'quarantined', observations: 2 });

    _ensureOpeningCards(repRepo, puzzleRepo);

    const puzzle = puzzleRepo.getByFenAndKind(fen, 'opening');
    const accepted = JSON.parse(puzzle.acceptedMovesJson);
    expect(accepted).toContain('e2e4');
    expect(accepted).toContain('d2d4');
    expect(accepted).toContain('c2c4');
    expect(accepted).not.toContain('g1f3'); // quarantined excluded
  });

  it('is idempotent — calling twice does not duplicate cards', () => {
    const repRepo = makeRepertoire();
    const puzzleRepo = makePuzzles();
    const epd = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3';
    const fen = epd + ' 0 1';

    repRepo.upsertNode({ epd, side: 'white', fen, timesReached: 2, encounters: 2, firstSeen: 1, lastSeen: 2 });
    repRepo.upsertMove({ epd, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'canonical', observations: 2 });

    _ensureOpeningCards(repRepo, puzzleRepo);
    _ensureOpeningCards(repRepo, puzzleRepo);

    // Should be exactly 1 puzzle
    const p1 = puzzleRepo.getByFenAndKind(fen, 'opening');
    expect(p1).not.toBeNull();
    // timesSeen should not have incremented (same fen+kind hit the idempotent path)
    // The memory repo increments timesSeen on duplicate saves — _ensureOpeningCards should skip the save
    expect(p1.timesSeen).toBe(1);
  });

  it('does not create a card when no canonical move exists', () => {
    const repRepo = makeRepertoire();
    const puzzleRepo = makePuzzles();
    const epd = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3';
    const fen = epd + ' 0 1';

    repRepo.upsertNode({ epd, side: 'white', fen, timesReached: 1, encounters: 1, firstSeen: 1, lastSeen: 1 });
    repRepo.upsertMove({ epd, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'candidate', observations: 1 });

    _ensureOpeningCards(repRepo, puzzleRepo);

    expect(puzzleRepo.getByFenAndKind(fen, 'opening')).toBeNull();
  });

  it('invariant 7: canonical node always has an opening puzzle and FSRS card after _ensureOpeningCards', () => {
    const repRepo = makeRepertoire();
    const puzzleRepo = makePuzzles();
    const epd = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6';
    const fen = epd + ' 0 2';

    repRepo.upsertNode({ epd, side: 'black', fen, timesReached: 2, encounters: 2, firstSeen: 1, lastSeen: 2 });
    repRepo.upsertMove({ epd, side: 'black', moveUci: 'e7e5', moveSan: 'e5', role: 'canonical', observations: 2 });

    _ensureOpeningCards(repRepo, puzzleRepo);

    const puzzle = puzzleRepo.getByFenAndKind(fen, 'opening');
    expect(puzzle).not.toBeNull();
    expect(puzzleRepo.getCard(puzzle.id)).not.toBeNull();
  });
});
