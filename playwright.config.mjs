import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.mjs",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/e2e/html", open: "never" }],
    ["junit", { outputFile: "artifacts/e2e/junit.xml" }]
  ],
  outputDir: "artifacts/e2e/results",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" }
});
