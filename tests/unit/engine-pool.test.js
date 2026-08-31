/**
 * Engine pool routing tests.
 * Uses vi.mock to intercept createUciEngineClient so no real processes are spawned.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the UCI engine client factory — must be at module level before any imports
vi.mock('../../src/adapters/engine/uci-engine-client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createUciEngineClient: vi.fn(),
  };
});

// Mock config so ENGINE_PATHS.maia3 is a predictable test value
vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ENGINE_PATHS: {
      ...actual.ENGINE_PATHS,
      maia3: '/test/bin/maia3-5m',
    },
    WEIGHTS_DIR: '/test/weights',
  };
});

import { createUciEngineClient } from '../../src/adapters/engine/uci-engine-client.js';
import { createEnginePool } from '../../src/adapters/engine/engine-pool.js';

function makeMockClient(bestmove = 'e2e4') {
  const calls = { setOption: [], eval: [] };
  return {
    _calls: calls,
    setOption: vi.fn((name, value) => { calls.setOption.push({ name, value: String(value) }); }),
    eval: vi.fn(async () => ({ bestmove, cp: null, mate: null, pv: '', lines: [] })),
    _proc: { once: vi.fn() },
    dispose: vi.fn(),
  };
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('engine pool: maia3 routing', () => {
  let pool;
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = makeMockClient('e2e4');
    vi.mocked(createUciEngineClient).mockResolvedValue(mockClient);
    pool = createEnginePool();
  });

  it('requestMove for maia3 spawns the maia3 binary, not lc0', async () => {
    await pool.requestMove({
      opponent: { id: 'maia-1300', elo: 1300, type: 'maia3' },
      fen: START_FEN,
    });
    expect(createUciEngineClient).toHaveBeenCalledOnce();
    const [binary] = vi.mocked(createUciEngineClient).mock.calls[0];
    expect(binary).toBe('/test/bin/maia3-5m');
    expect(binary).not.toMatch(/lc0/);
  });

  it('requestMove for maia3 passes --cache-dir and --local-files-only args', async () => {
    await pool.requestMove({
      opponent: { id: 'maia-1300', elo: 1300, type: 'maia3' },
      fen: START_FEN,
    });
    const [, args] = vi.mocked(createUciEngineClient).mock.calls[0];
    expect(args).toContain('--local-files-only');
    expect(args.some(a => a.includes('maia3'))).toBe(true);
  });

  it('requestMove for maia3 sends SelfElo matching opponent.elo', async () => {
    await pool.requestMove({
      opponent: { id: 'maia-1700', elo: 1700, type: 'maia3' },
      fen: START_FEN,
    });
    const selfEloCall = mockClient._calls.setOption.find(c => c.name === 'SelfElo');
    expect(selfEloCall).toBeDefined();
    expect(String(selfEloCall.value)).toBe('1700');
  });

  it('requestMove for maia3 sends Temperature 0', async () => {
    await pool.requestMove({
      opponent: { id: 'maia-1300', elo: 1300, type: 'maia3' },
      fen: START_FEN,
    });
    const tempCall = mockClient._calls.setOption.find(c => c.name === 'Temperature');
    expect(tempCall).toBeDefined();
    expect(tempCall.value).toBe('0');
  });

  it('requestMove for maia3 returns the engine bestmove', async () => {
    const result = await pool.requestMove({
      opponent: { id: 'maia-1300', elo: 1300, type: 'maia3' },
      fen: START_FEN,
    });
    expect(result.uci).toBe('e2e4');
  });

  it('requestMove reuses the maia3 client across multiple calls (single process)', async () => {
    await pool.requestMove({ opponent: { id: 'maia-1300', elo: 1300, type: 'maia3' }, fen: START_FEN });
    await pool.requestMove({ opponent: { id: 'maia-1500', elo: 1500, type: 'maia3' }, fen: START_FEN });
    // Both should use the same pooled process — only one spawn
    expect(createUciEngineClient).toHaveBeenCalledOnce();
  });

  it('SelfElo is updated on every requestMove for different Elos', async () => {
    await pool.requestMove({ opponent: { id: 'maia-1300', elo: 1300, type: 'maia3' }, fen: START_FEN });
    await pool.requestMove({ opponent: { id: 'maia-1700', elo: 1700, type: 'maia3' }, fen: START_FEN });
    const selfEloCalls = mockClient._calls.setOption.filter(c => c.name === 'SelfElo');
    expect(selfEloCalls.map(c => c.value)).toEqual(['1300', '1700']);
  });

  it('requestMove for unknown type throws', async () => {
    await expect(
      pool.requestMove({ opponent: { id: 'weird', elo: 1000, type: 'unknown' }, fen: START_FEN })
    ).rejects.toThrow(/Unknown opponent type/);
  });
});

describe('engine pool: maia3 policy client', () => {
  let pool;
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = makeMockClient('e2e4');
    vi.mocked(createUciEngineClient).mockResolvedValue(mockClient);
    pool = createEnginePool();
  });

  it('getMaia3PolicyClient returns a client', async () => {
    const client = await pool.getMaia3PolicyClient();
    expect(client).toBeDefined();
  });

  it('getMaia3PolicyClient sets Temperature 1.0 on first init', async () => {
    await pool.getMaia3PolicyClient();
    const tempCall = mockClient._calls.setOption.find(c => c.name === 'Temperature');
    expect(tempCall).toBeDefined();
    expect(tempCall.value).toBe('1.0');
  });

  it('getMaia3PolicyClient sets VerboseMoveStats true on first init', async () => {
    await pool.getMaia3PolicyClient();
    const vmsCall = mockClient._calls.setOption.find(c => c.name === 'VerboseMoveStats');
    expect(vmsCall).toBeDefined();
    expect(vmsCall.value).toBe('true');
  });

  it('getMaia3PolicyClient uses a separate pool key from game-play maia3', async () => {
    // Request a game-play move (uses key 'maia3') then getMaia3PolicyClient (uses 'maia3-policy')
    await pool.requestMove({ opponent: { id: 'maia-1300', elo: 1300, type: 'maia3' }, fen: START_FEN });
    vi.clearAllMocks();
    const secondClient = makeMockClient('d2d4');
    vi.mocked(createUciEngineClient).mockResolvedValue(secondClient);
    await pool.getMaia3PolicyClient();
    // A new spawn was required because 'maia3-policy' was not in pool
    expect(createUciEngineClient).toHaveBeenCalledOnce();
  });

  it('getMaia3PolicyClient reuses the policy client across calls', async () => {
    await pool.getMaia3PolicyClient();
    vi.clearAllMocks();
    await pool.getMaia3PolicyClient();
    expect(createUciEngineClient).not.toHaveBeenCalled();
  });

  it('getMaia3PolicyClient passes --cache-dir and --local-files-only', async () => {
    await pool.getMaia3PolicyClient();
    const [, args] = vi.mocked(createUciEngineClient).mock.calls[0];
    expect(args).toContain('--local-files-only');
    expect(args.some(a => a.includes('maia3'))).toBe(true);
  });
});
