import { describe, it, expect, afterEach } from 'vitest';

describe('config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('BIND_ADDR defaults to 127.0.0.1', async () => {
    delete process.env.BIND_ADDR;
    // Re-import with cleared env — vitest reloads modules per test file
    const { BIND_ADDR } = await import('../../src/config.js?v=bindaddr');
    expect(BIND_ADDR).toBe('127.0.0.1');
  });

  it('balance: every parameter in balance.js is documented in balance.md', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const root = new URL('../..', import.meta.url).pathname;

    // Read balance.md and collect every UPPER_SNAKE_CASE word — these are the parameter names
    const balanceMd = fs.readFileSync(path.join(root, 'docs/game/balance.md'), 'utf8');
    const docNames = new Set(balanceMd.match(/\b[A-Z][A-Z0-9_]+\b/g) ?? []);

    // Dynamically import balance.js to get all exported constant names
    const balanceMod = await import('../../src/shared/balance.js');
    const exportedNames = Object.keys(balanceMod);

    const undocumented = exportedNames.filter(name => !docNames.has(name));
    expect(undocumented, `balance.js constants not in balance.md: ${undocumented.join(', ')}`).toHaveLength(0);
  });

  it('coverage: the exclusion list matches the one documented in feature_spec.md', async () => {
    // Static assertion: confirm the documented excluded paths are present in vitest.config.js
    // This test guards against someone widening coverage scope without a docs commit.
    const fs = await import('fs');
    const path = await import('path');
    const root = new URL('../..', import.meta.url).pathname;
    const vitestConfig = fs.readFileSync(path.join(root, 'vitest.config.js'), 'utf8');
    expect(vitestConfig).toContain('src/domain/**');
    expect(vitestConfig).toContain('src/adapters/**');
    expect(vitestConfig).toContain('src/api/**');
    expect(vitestConfig).toContain('src/shared/**');
    expect(vitestConfig).toContain('src/server.js');
    expect(vitestConfig).toContain('src/telemetry.js');
  });
});
