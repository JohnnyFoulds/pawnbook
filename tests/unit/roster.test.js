import { describe, it, expect, vi, afterEach } from 'vitest';

import { getRosterTable, getOpponent } from '../../src/domain/game/roster.js';

// Mock fs.existsSync at module level for the tests that need it
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true), // default: all files exist
  };
});

afterEach(() => {
  vi.resetModules();
});

describe('roster', () => {
  it('getRosterTable returns all 19 entries', () => {
    const table = getRosterTable();
    expect(table.length).toBe(19);
  });

  it('getOpponent resolves a known id', () => {
    const opp = getOpponent('maia-1300');
    expect(opp.elo).toBe(1300);
    expect(opp.type).toBe('maia3');
  });

  it('getOpponent throws for an unknown id', () => {
    expect(() => getOpponent('bogus-9999')).toThrow(/bogus-9999/);
  });

  it('drawfish has elo=null', () => {
    const df = getOpponent('drawfish');
    expect(df.elo).toBeNull();
  });

  it('maia-2200 is no longer optional (maia3-backed)', () => {
    const maia2200 = getRosterTable().find(o => o.id === 'maia-2200');
    expect(maia2200.optional).toBeUndefined();
    expect(maia2200.type).toBe('maia3');
  });

  it('maia-2000 fills the former 1900→2200 gap', () => {
    const maia2000 = getOpponent('maia-2000');
    expect(maia2000.elo).toBe(2000);
    expect(maia2000.type).toBe('maia3');
  });

  it('sf-max has elo=3190', () => {
    const sfMax = getOpponent('sf-max');
    expect(sfMax.elo).toBe(3190);
  });

  it('getAvailableOpponents excludes all maia3 entries when binary is missing', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('maia3')) return false;
      return true;
    });

    const { getAvailableOpponents } = await import('../../src/domain/game/roster.js');
    const opponents = getAvailableOpponents();
    const types = opponents.map(o => o.type);
    expect(types).not.toContain('maia3');
    // Stockfish and drawfish still available
    expect(opponents.some(o => o.type === 'stockfish')).toBe(true);

    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('getAvailableOpponents includes maia3 entries when binary exists', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);

    const { getAvailableOpponents } = await import('../../src/domain/game/roster.js');
    const opponents = getAvailableOpponents();
    const maia3Ids = opponents.filter(o => o.type === 'maia3').map(o => o.id);
    expect(maia3Ids).toContain('maia-1300');
    expect(maia3Ids).toContain('maia-2000');
    expect(maia3Ids).toContain('maia-2200');
  });

  it('getMaiaAnalysisWeights returns lc0 weight IDs that exist on disk', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(true);

    const { getMaiaAnalysisWeights } = await import('../../src/domain/game/roster.js');
    const weights = getMaiaAnalysisWeights();
    expect(weights.length).toBe(9);
    expect(weights).toContain('maia-1300');
    expect(weights).toContain('maia-1900');
    expect(weights).not.toContain('maia-2000'); // maia3-only, no pb.gz
  });

  it('getMaiaAnalysisWeights returns empty when no lc0 pb.gz files are present', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false);

    const { getMaiaAnalysisWeights } = await import('../../src/domain/game/roster.js');
    const weights = getMaiaAnalysisWeights();
    expect(weights).toEqual([]);

    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('getMaiaAnalysisWeights only returns IDs whose file exists', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockImplementation((p) => {
      return typeof p === 'string' && p.includes('maia-1500');
    });

    const { getMaiaAnalysisWeights } = await import('../../src/domain/game/roster.js');
    const weights = getMaiaAnalysisWeights();
    expect(weights).toEqual(['maia-1500']);

    vi.mocked(existsSync).mockReturnValue(true);
  });
});
