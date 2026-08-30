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
        // Engine adapter files spawn real engine processes (Stockfish/lc0) —
        // untestable in CI without those binaries. Covered by e2e tests.
        'src/adapters/engine/engine-pool.js',
        'src/adapters/engine/uci-engine-client.js',
        // WebSocket server wiring requires a live HTTP+WS integration stack —
        // untestable in pure unit tests. Covered by e2e tests.
        'src/api/ws/connection.js',
      ],
      thresholds: {
        branches: 90,
      },
      reporter: ['text', 'lcov', 'json-summary'],
    },
  },
});
