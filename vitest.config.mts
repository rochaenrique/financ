import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Pins TZ before any worker starts: schedules and date ranges are built
    // from local-time calendar math, so results must not depend on whichever
    // machine (or CI runner) happens to run them.
    globalSetup: ["src/test/global-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/**/*.test.ts",
        // Needs a real pdf.js + browser environment; not covered by the
        // automated tests yet.
        "src/lib/pdf-import.ts",
        // React hooks over the store in projects.ts; exercised end to end
        // by the Playwright suite instead.
        "src/lib/use-projects.ts",
      ],
      reporter: ["text", "text-summary"],
    },
  },
});
