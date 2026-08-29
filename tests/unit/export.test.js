/**
 * Tests for export-utils.js helper functions.
 * Verifies determinism invariants required by invariant 13.
 */
import { describe, it, expect } from 'vitest';
import { sortedNdjson, buildPgn, computeManifest } from '../../scripts/lib/export-utils.js';

describe('sortedNdjson', () => {
  it('produces stable ordering by key function', () => {
    const rows = [
      { id: 'b', val: 2 },
      { id: 'a', val: 1 },
      { id: 'c', val: 3 },
    ];
    const result = sortedNdjson(rows, r => r.id);
    const lines = result.split('\n');
    expect(JSON.parse(lines[0]).id).toBe('a');
    expect(JSON.parse(lines[1]).id).toBe('b');
    expect(JSON.parse(lines[2]).id).toBe('c');
  });

  it('returns empty string for empty rows', () => {
    expect(sortedNdjson([], r => r.id)).toBe('');
  });

  it('produces identical output on two calls with same input (deterministic)', () => {
    const rows = [{ epd: 'rnbqkbnr', side: 'white', val: 1 }, { epd: 'abc', side: 'black', val: 2 }];
    const a = sortedNdjson(rows, r => [r.epd, r.side]);
    const b = sortedNdjson(rows, r => [r.epd, r.side]);
    expect(a).toBe(b);
  });

  it('sorts by compound key correctly', () => {
    const rows = [
      { game_id: 'g2', ply: 1 },
      { game_id: 'g1', ply: 2 },
      { game_id: 'g1', ply: 1 },
    ];
    const result = sortedNdjson(rows, r => [r.game_id, r.ply]);
    const lines = result.split('\n');
    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed[0]).toMatchObject({ game_id: 'g1', ply: 1 });
    expect(parsed[1]).toMatchObject({ game_id: 'g1', ply: 2 });
    expect(parsed[2]).toMatchObject({ game_id: 'g2', ply: 1 });
  });
});

describe('buildPgn', () => {
  const game = {
    id: 'test-game-1',
    opponent_id: 'maia-1500',
    result: 'win',
    player_color: 'white',
  };
  const moves = [
    { ply: 1, san: 'e4' },
    { ply: 2, san: 'e5' },
    { ply: 3, san: 'Nf3' },
    { ply: 4, san: 'Nc6' },
  ];

  it('produces stable PGN with move numbers', () => {
    const pgn = buildPgn(moves, game);
    expect(pgn).toContain('1. e4 e5 2. Nf3 Nc6');
    expect(pgn).toContain('[GameId "test-game-1"]');
    expect(pgn).toContain('[White "Player"]');
    expect(pgn).toContain('[Black "maia-1500"]');
    expect(pgn).toContain('[Result "1-0"]');
  });

  it('sorts moves by ply even if passed out of order', () => {
    const shuffled = [moves[2], moves[0], moves[3], moves[1]];
    const pgn = buildPgn(shuffled, game);
    expect(pgn).toContain('1. e4 e5 2. Nf3 Nc6');
  });

  it('omits White header when anonymise=true', () => {
    const pgn = buildPgn(moves, game, true);
    expect(pgn).not.toContain('[White');
    expect(pgn).toContain('[Black "maia-1500"]');
  });

  it('includes BookVersion header when provided', () => {
    const pgn = buildPgn(moves, game, false, 42);
    expect(pgn).toContain('[BookVersion "42"]');
  });

  it('produces identical output on two calls (deterministic)', () => {
    const a = buildPgn(moves, game, false, 1);
    const b = buildPgn(moves, game, false, 1);
    expect(a).toBe(b);
  });

  it('handles loss result correctly', () => {
    const lossGame = { ...game, result: 'loss', player_color: 'white' };
    const pgn = buildPgn(moves, lossGame);
    expect(pgn).toContain('[Result "0-1"]');
  });

  it('handles draw result correctly', () => {
    const drawGame = { ...game, result: 'draw' };
    const pgn = buildPgn(moves, drawGame);
    expect(pgn).toContain('[Result "1/2-1/2"]');
  });
});

describe('computeManifest', () => {
  it('produces sha256sum-compatible output', () => {
    const files = new Map([
      ['a.ndjson', 'hello'],
      ['b.ndjson', 'world'],
    ]);
    const manifest = computeManifest(files);
    const lines = manifest.trim().split('\n');
    expect(lines).toHaveLength(2);
    // Each line: <64-char hex>  <filename>
    expect(lines[0]).toMatch(/^[0-9a-f]{64}  [a-z.]+$/);
  });

  it('is sorted by filename', () => {
    const files = new Map([
      ['z.ndjson', 'z'],
      ['a.ndjson', 'a'],
      ['m.ndjson', 'm'],
    ]);
    const manifest = computeManifest(files);
    const lines = manifest.trim().split('\n');
    expect(lines[0]).toContain('a.ndjson');
    expect(lines[1]).toContain('m.ndjson');
    expect(lines[2]).toContain('z.ndjson');
  });

  it('is deterministic across two calls with same input', () => {
    const files = new Map([
      ['rep_moves.ndjson', '{"epd":"rnb","role":"canonical"}'],
      ['games.ndjson', '{"id":"g1"}'],
    ]);
    expect(computeManifest(files)).toBe(computeManifest(files));
  });

  it('returns empty string for empty map', () => {
    expect(computeManifest(new Map())).toBe('');
  });

  it('changes when content changes', () => {
    const files1 = new Map([['games.ndjson', '{"id":"g1"}']]);
    const files2 = new Map([['games.ndjson', '{"id":"g2"}']]);
    expect(computeManifest(files1)).not.toBe(computeManifest(files2));
  });
});
