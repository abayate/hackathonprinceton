import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reportsDirectory: "../.verification/coverage",
      reporter: ["text", "json-summary"],
      include: ["lib/propertyReview.ts", "lib/sourceReading.ts", "lib/sourceMonitor.ts", "lib/sourceMonitorStorage.ts", "app/api/sources/check/route.ts", "lib/workspace.ts", "lib/workspaceStorage.ts", "lib/requestBody.ts", "lib/vexcelProxy.ts", "app/api/vexcel/**/route.ts", "lib/intakePipeline.ts", "lib/investigator.ts", "lib/geminiClient.ts", "app/api/investigate/route.ts", "lib/mapPins.ts", "lib/params.ts", "lib/signals.ts", "lib/caseStudies.ts", "lib/signalStore.ts", "lib/labelReview.ts", "lib/model.ts", "lib/valuation.ts", "lib/modelCard.ts", "lib/modelArtifact.ts", "lib/publicData.ts", "lib/publicStore.ts", "lib/dataMode.ts", "lib/db.ts", "lib/sites.ts", "lib/safeFetch.ts", "lib/quoteVerify.ts", "lib/intakeStore.ts", "lib/featureFlags.ts", "app/error.tsx", "app/api/watchlist/route.ts", "app/api/evidence/route.ts"],
      thresholds: { perFile: true, lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
