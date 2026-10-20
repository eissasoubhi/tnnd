import { build } from "vite";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const watch = process.argv.includes("--watch");
const root = process.cwd();
const outDir = resolve(root, "dist");
await rm(outDir, { recursive: true, force: true });
await mkdir(resolve(outDir, "assets"), { recursive: true });
for (const file of ["manifest.json", "options.html", "preview.html", "popup.html", "launcher.html", "connect.html", "neo-bento.css"]) await cp(resolve(root, `public/${file}`), resolve(outDir, file));

// Create build provenance on EVERY local/Docker/CI build, not only in a
// later GitHub Actions upload step. A missing Git commit is an error: do not
// display an invented or stale hash as the currently installed revision.
const manifest = JSON.parse(await readFile(resolve(root, "public/manifest.json"), "utf8"));
let commit;
try {
  commit = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
} catch {
  // The Docker extension service uses node:22-alpine, which may lack the git
  // executable. The mounted checkout still provides .git/HEAD and refs.
  // Reading these is equivalent to git rev-parse HEAD for a normal checkout,
  // including refs stored inside packed-refs.
  try {
    const head = (await readFile(resolve(root, ".git/HEAD"), "utf8")).trim();
    if (/^[a-f0-9]{40}$/i.test(head)) {
      commit = head;
    } else if (head.startsWith("ref: ")) {
      const ref = head.slice(5).trim();
      if (!/^refs\/(heads|tags)\/[a-zA-Z0-9._/-]+$/.test(ref) ||
          ref.split("/").includes("..")) throw new Error("Invalid HEAD ref");
      try {
        commit = (await readFile(resolve(root, ".git", ref), "utf8")).trim();
      } catch {
        const packed = await readFile(resolve(root, ".git/packed-refs"), "utf8");
        const line = packed.split("\n").find(x => x.endsWith(" " + ref));
        commit = line?.split(" ")[0];
      }
    }
  } catch { /* Worktrees or exported source archives require explicit commit. */ }
  // Archives without a Git directory can supply their verified source SHA.
  commit ??= process.env.TNND_BUILD_COMMIT?.trim();
}
if (!/^[a-f0-9]{40}$/i.test(commit ?? ""))
  throw new Error("TNND build requires a valid source Git commit. Build inside the checkout or supply verified TNND_BUILD_COMMIT.");
await writeFile(resolve(outDir, "BUILD-INFO.json"),
  JSON.stringify({ version: manifest.version, commit: commit.toLowerCase() }, null, 2) + "\n");


const entries = [
  ["background", "src/background.ts"],
  ["options", "src/options.ts"],
  ["preview", "src/preview.ts"],
  ["content", "src/content.ts"],
  ["chat-bridge", "src/chat-bridge.ts"],
  ["web-diagnostic-page", "src/web-diagnostic-page.ts"],
  ["web-diagnostic-bridge", "src/web-diagnostic-bridge.ts"],
  ["web-ui-audit-content", "src/web-ui-audit-content.ts"],
  ["popup", "src/popup.ts"],
  ["launcher", "src/launcher.ts"],
  ["connect", "src/connect.ts"]
];
const builds = entries.map(([name, entry]) => build({
  configFile: false, logLevel: "info",
  build: { target: "chrome120", outDir: resolve(outDir, "assets"), emptyOutDir: false, sourcemap: true, minify: false, watch: watch ? {} : null,
    lib: { entry: resolve(root, entry), name: `TNND_${name.replaceAll("-", "_")}`, formats: ["iife"], fileName: () => `${name}.js` }
  }
}));
await Promise.all(builds);
console.log(`TNND build ready in ${outDir}${watch ? " (watching)" : ""}`);
