import { build } from "vite";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const watch = process.argv.includes("--watch");
const root = process.cwd();
const outDir = resolve(root, "dist");

await rm(outDir, { recursive: true, force: true });
await mkdir(resolve(outDir, "assets"), { recursive: true });
await cp(resolve(root, "public/manifest.json"), resolve(outDir, "manifest.json"));
await cp(resolve(root, "public/options.html"), resolve(outDir, "options.html"));

const entries = [
  ["background", "src/background.ts"],
  ["content", "src/content.ts"],
  ["options", "src/options.ts"]
];

const builds = entries.map(([name, entry]) =>
  build({
    configFile: false,
    logLevel: "info",
    build: {
      target: "chrome120",
      outDir: resolve(outDir, "assets"),
      emptyOutDir: false,
      sourcemap: true,
      minify: false,
      watch: watch ? {} : null,
      lib: {
        entry: resolve(root, entry),
        name: `TNND_${name}`,
        formats: ["iife"],
        fileName: () => `${name}.js`
      }
    }
  })
);

await Promise.all(builds);
console.log(`TNND build ready in ${outDir}${watch ? " (watching)" : ""}`);
