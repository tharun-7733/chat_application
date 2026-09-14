import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    reporter: "verbose",
    include: ["tests/**/*.test.ts"],
    // Longer timeout for mongodb-memory-server (first run downloads binary)
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run test files sequentially — each file manages its own DB lifecycle
    // (concurrent forks would race on the same in-memory server)
    fileParallelism: false,
  },
});
