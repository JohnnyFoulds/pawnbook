import { describe, it, expect, vi } from 'vitest';

import { getRosterTable, getOpponent } from '../../src/domain/game/roster.js';

// Mock fs.existsSync at module level for the two tests that need it
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true), // default: all files exist
  };
});

describe('roster', () => {
  it('getRosterTable returns all 18 entries', () => {
    const table = getRosterTable();
    expect(table.length).toBe(18);
  });

  it('getOpponent resolves a known id', () => {
    const opp = getOpponent('maia-1300');
    expect(opp.elo).toBe(1300);
    expect(opp.type).toBe('maia');
  });

  it('getOpponent throws for an unknown id', () => {
    expect(() => getOpponent('bogus-9999')).toThrow(/bogus-9999/);
  });

  it('drawfish has elo=null', () => {
    const df = getOpponent('drawfish');
    expect(df.elo).toBeNull();
  });

  it('maia-2200 is marked optional', () => {
    const maia2200 = getRosterTable().find(o => o.id === 'maia-2200');
    expect(maia2200.optional).toBe(true);
  });

  it('sf-max has elo=3190', () => {
    const sfMax = getOpponent('sf-max');
    expect(sfMax.elo).toBe(3190);
  });

  it('getAvailableOpponents throws WeightsMissingError for missing required weights', async () => {
    const { existsSync } = await import('fs');
    vi.mocked(existsSync).mockReturnValue(false); // all files missing

    const { getAvailableOpponents } = await import('../../src/domain/game/roster.js');
    const { WeightsMissingError } = await import('../../src/errors.js');

    expect(() => getAvailableOpponents()).toThrow(WeightsMissingError);

    vi.mocked(existsSync).mockReturnValue(true); // restore
  });

  it('getAvailableOpponents logs warn and excludes optional missing weights', async () => {
    const { existsSync } = await import('fs');
    // Return false only for maia-2200
    vi.mocked(existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('maia-2200')) return false;
      return true;
    });

    const { getAvailableOpponents } = await import('../../src/domain/game/roster.js');
    const opponents = getAvailableOpponents();
    const ids = opponents.map(o => o.id);
    expect(ids).not.toContain('maia-2200');
    expect(ids).toContain('maia-1300');

    vi.mocked(existsSync).mockReturnValue(true); // restore
  });
});
