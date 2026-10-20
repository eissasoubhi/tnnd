/** PR gate: extension-affecting changes must bump the installable version.
 * Commit provenance itself is stamped by scripts/build.mjs on every build,
 * including local Docker runs. Version cannot be inferred from a Git SHA.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const baseRef = process.env.GITHUB_BASE_REF;
if (!baseRef) {
  console.log("Extension version bump gate is for pull requests; skipping outside a PR.");
} else {
  if (!/^[a-zA-Z0-9._/-]+$/.test(baseRef)) throw new Error("Invalid base branch");
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const base = git("merge-base", "HEAD", "origin/" + baseRef);
  const changed = git("diff", "--name-only", base, "HEAD").split("\n").filter(Boolean);
  const touchedExtension = changed.some(path =>
    /^(src\/|public\/|scripts\/build\.mjs$|scripts\/check-extension-version|scripts\/check-unified-quota-status)/.test(path));
  if (touchedExtension) {
    const previous = JSON.parse(git("show", base + ":public/manifest.json")).version;
    const current = JSON.parse(readFileSync("public/manifest.json", "utf8")).version;
    const pack = JSON.parse(readFileSync("package.json", "utf8")).version;
    const number = v => {
      if (typeof v !== "string" || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(v)) throw new Error("Invalid version");
      const parts = v.split(".").map(Number);
      if (parts.some(n => !Number.isSafeInteger(n) || n < 0 || n > 65535))
        throw new Error("Invalid Chrome version part");
      return parts;
    };
    const before = number(previous), after = number(current);
    const width = Math.max(before.length, after.length);
    let increased = false;
    for (let i = 0; i < width; i++) {
      const a = before[i] ?? 0, b = after[i] ?? 0;
      if (a !== b) { increased = b > a; break; }
    }
    if (!increased || current !== pack)
      throw new Error("TNND extension code changed; bump both public/manifest.json and package.json above " + previous + ". Current: " + current + " / " + pack);
    console.log("TNND extension version bump verified: " + previous + " -> " + current);
  } else {
    console.log("No extension source changed: version bump not required.");
  }
}
