/**
 * Unit tests for repertoire-service helpers.
 */
import { describe, it, expect } from 'vitest';
import { InMemoryRepertoireRepository, InMemoryPuzzleRepository } from '../../../src/adapters/memory/repositories.js';
import { _ensureOpeningCards, getProvenanceId } from '../../../src/api/ws/repertoire-service.js';

const EPD = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3';
const FEN = EPD + ' 0 1';

function makeRepoWithCanonical() {
  const repo = new InMemoryRepertoireRepository();
  repo.upsertNode({ epd: EPD, side: 'white', fen: FEN, timesReached: 3, encounters: 3, firstSeen: 1000, lastSeen: 2000 });
  repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'canonical', observations: 3, scoreW: 2, scoreD: 1, scoreL: 0 });
  return repo;
}

describe('getProvenanceId', () => {
  it('returns a provenance id from an in-memory repo', () => {
    const repo = new InMemoryRepertoireRepository();
    const id = getProvenanceId(repo);
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('returns the same id on repeated calls', () => {
    const repo = new InMemoryRepertoireRepository();
    const id1 = getProvenanceId(repo);
    const id2 = getProvenanceId(repo);
    expect(id1).toBe(id2);
  });
});

describe('_ensureOpeningCards', () => {
  it('creates an opening puzzle card for a canonical node', () => {
    const repertoireRepo = makeRepoWithCanonical();
    const puzzleRepo = new InMemoryPuzzleRepository();

    _ensureOpeningCards(repertoireRepo, puzzleRepo);

    const card = puzzleRepo.getByFenAndKind(FEN, 'opening');
    expect(card).not.toBeNull();
    expect(card.bestMoveUci).toBe('e2e4');
    expect(card.kind).toBe('opening');
  });

  it('includes canonical + alt + challenger moves in acceptedMovesJson', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode({ epd: EPD, side: 'white', fen: FEN, timesReached: 3, encounters: 3, firstSeen: 1000, lastSeen: 2000 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'e2e4', moveSan: 'e4', role: 'canonical', observations: 3, scoreW: 2, scoreD: 1, scoreL: 0 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'd2d4', moveSan: 'd4', role: 'alt', observations: 2, scoreW: 1, scoreD: 1, scoreL: 0 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'g1f3', moveSan: 'Nf3', role: 'challenger', observations: 1, scoreW: 1, scoreD: 0, scoreL: 0 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'b2b4', moveSan: 'b4', role: 'refused', observations: 1, scoreW: 0, scoreD: 0, scoreL: 1 });

    const puzzleRepo = new InMemoryPuzzleRepository();
    _ensureOpeningCards(repo, puzzleRepo);

    const card = puzzleRepo.getByFenAndKind(FEN, 'opening');
    expect(card).not.toBeNull();
    const accepted = JSON.parse(card.acceptedMovesJson);
    expect(accepted).toContain('e2e4');
    expect(accepted).toContain('d2d4');
    expect(accepted).toContain('g1f3');
    expect(accepted).not.toContain('b2b4');
  });

  it('skips nodes without a canonical move', () => {
    const repo = new InMemoryRepertoireRepository();
    repo.upsertNode({ epd: EPD, side: 'white', fen: FEN, timesReached: 2, encounters: 2, firstSeen: 1000, lastSeen: 2000 });
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'd2d4', moveSan: 'd4', role: 'candidate', observations: 2, scoreW: 1, scoreD: 1, scoreL: 0 });

    const puzzleRepo = new InMemoryPuzzleRepository();
    _ensureOpeningCards(repo, puzzleRepo);

    expect(puzzleRepo.getByFenAndKind(FEN, 'opening')).toBeNull();
  });

  it('updates acceptedMovesJson when card already exists', () => {
    const repo = makeRepoWithCanonical();
    const puzzleRepo = new InMemoryPuzzleRepository();

    // Create card first
    _ensureOpeningCards(repo, puzzleRepo);

    // Now add an alt move
    repo.upsertMove({ epd: EPD, side: 'white', moveUci: 'd2d4', moveSan: 'd4', role: 'alt', observations: 2, scoreW: 1, scoreD: 1, scoreL: 0 });

    // Re-run — should update acceptedMovesJson
    _ensureOpeningCards(repo, puzzleRepo);

    const card = puzzleRepo.getByFenAndKind(FEN, 'opening');
    expect(card).not.toBeNull();
    const accepted = JSON.parse(card.acceptedMovesJson);
    expect(accepted).toContain('d2d4');
  });

  it('does not create a duplicate FSRS card if one already exists', () => {
    const repo = makeRepoWithCanonical();
    const puzzleRepo = new InMemoryPuzzleRepository();

    _ensureOpeningCards(repo, puzzleRepo);
    const cardBefore = puzzleRepo.getByFenAndKind(FEN, 'opening');
    const fsrsBefore = puzzleRepo.getCard(cardBefore.id);
    expect(fsrsBefore).not.toBeNull();

    // Set card state to simulate existing review history
    puzzleRepo.saveCard({ ...fsrsBefore, reps: 5, stability: 10, state: 2 });

    _ensureOpeningCards(repo, puzzleRepo);
    const fsrsAfter = puzzleRepo.getCard(cardBefore.id);
    expect(fsrsAfter.reps).toBe(5); // not reset
  });

  it('is idempotent — calling twice does not duplicate puzzles', () => {
    const repo = makeRepoWithCanonical();
    const puzzleRepo = new InMemoryPuzzleRepository();

    _ensureOpeningCards(repo, puzzleRepo);
    _ensureOpeningCards(repo, puzzleRepo);

    const all = puzzleRepo.listAll().filter(p => p.kind === 'opening');
    expect(all).toHaveLength(1);
  });
});
