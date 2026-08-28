import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['node_modules', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**',
        'src/adapters/**',
        'src/api/**',
        'src/shared/**',
      ],
      exclude: [
        'src/server.js',
        'src/telemetry.js',
        // These require a live engine binary — covered by smoke.sh in Phase 8
        'src/adapters/engine/uci-engine-client.js',
        'src/adapters/engine/engine-pool.js',
      ],
      thresholds: {
        branches: 90,
      },
      reporter: ['text', 'lcov', 'json-summary'],
    },
  },
});
