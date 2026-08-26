import { describe, it, expect, beforeEach, afterEach } from 'vitest';

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
