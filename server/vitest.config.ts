import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Sequential files: each suite owns its in-memory DB; no cross-suite interference.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
