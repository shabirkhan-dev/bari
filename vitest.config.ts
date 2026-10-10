import { defineConfig } from "vitest/config";

// Domain + DB tests are plain TS — no DOM, no Solid compiler needed.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" }
});
