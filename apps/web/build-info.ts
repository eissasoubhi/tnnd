import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const SHA = /^[0-9a-f]{7,40}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/i;

function readText(path: string): string | null {
  try { return readFileSync(path, "utf8").trim(); } catch { return null; }
}
function gitDirectory(repositoryRoot: string): string | null {
  const git = join(repositoryRoot, ".git");
  try {
    if (statSync(git).isDirectory()) return git;
  } catch { /* a git worktree can have a .git file instead */ }
  const marker = readText(git)?.match(/^gitdir:\s*(.+)$/);
  if (!marker) return null;
  return isAbsolute(marker[1]) ? marker[1] : resolve(repositoryRoot, marker[1]);
}
function commonGitDirectory(git: string): string {
  const common = readText(join(git, "commondir"));
  return common ? resolve(git, common) : git;
}

/**
 * The Docker web container does not have Git installed. Read repository
 * metadata directly so the actual checkout SHA is available without tools or
 * network access. This is captured at Vite start/build, not invented.
 */
export function resolveWebCommit(
  repositoryRoot: string,
  env: Record<string, string | undefined> = {}
): string | null {
  for (const value of [env.TNND_WEB_GIT_SHA, env.GITHUB_SHA]) {
    if (value && SHA.test(value)) return value.toLowerCase();
  }
  const git = gitDirectory(repositoryRoot);
  if (!git) return null;
  const head = readText(join(git, "HEAD"));
  if (!head) return null;
  if (FULL_SHA.test(head)) return head.toLowerCase();
  const reference = head.match(/^ref:\s*(refs\/[a-zA-Z0-9/._-]+)$/)?.[1];
  if (!reference || reference.includes("..")) return null;
  const common = commonGitDirectory(git);
  for (const root of [git, common]) {
    const hash = readText(join(root, reference));
    if (hash && FULL_SHA.test(hash)) return hash.toLowerCase();
  }
  for (const root of [git, common]) {
    const packed = readText(join(root, "packed-refs"));
    const value = packed?.split("\n").find(line =>
      !line.startsWith("#") && !line.startsWith("^") && line.endsWith(" " + reference)
    )?.split(" ")[0];
    if (value && FULL_SHA.test(value)) return value.toLowerCase();
  }
  return null;
}

export function readWebVersion(webRoot: string): string {
  const raw = readText(join(webRoot, "package.json"));
  if (!raw) return "unknown";
  try {
    const value = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)
      ? value : "unknown";
  } catch { return "unknown"; }
}
