import { defineConfig } from "vitest/config";

// Vitest = the tool that finds and runs our test files.
// It understands TypeScript and ESM out of the box (no extra setup, unlike Jest).
export default defineConfig({
  test: {
    // Which files are tests: anything ending in .test.ts inside /tests
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});