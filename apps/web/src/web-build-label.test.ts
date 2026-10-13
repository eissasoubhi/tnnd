import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readWebVersion, resolveWebCommit } from "../build-info";
import { formatWebBuildDescription, formatWebBuildLabel } from "./web-build-label";

const commit = "0b49618323d8bcb5d449941964a7f5be2607f3af";
function fixture(callback: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "tnnd-web-build-"));
  try { callback(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
test("shows an unambiguous Web version and short Git SHA", () => {
  assert.equal(formatWebBuildLabel("0.2.0", commit), "Web v0.2.0 (0b496183)");
  assert.equal(formatWebBuildLabel("0.2.0", "unknown"), "Web v0.2.0 (unknown)");
  assert.match(formatWebBuildDescription("0.2.0", commit), new RegExp(commit));
  assert.match(formatWebBuildDescription("0.2.0", commit), /Restart Web after git pull/);
});
test("reads semantic Web version from Web package rather than extension version", () => {
  fixture(root => {
    writeFileSync(join(root, "package.json"), '{"version":"0.2.0"}');
    assert.equal(readWebVersion(root), "0.2.0");
    writeFileSync(join(root, "package.json"), '{"version":"bogus"}');
    assert.equal(readWebVersion(root), "unknown");
  });
});
test("reads loose git branch ref without requiring git CLI (Docker alpine)", () => {
  fixture(root => {
    const refs = join(root, ".git", "refs", "heads");
    mkdirSync(refs, { recursive: true });
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(refs, "main"), commit + "\n");
    assert.equal(resolveWebCommit(root), commit);
  });
});
test("reads packed refs when there is no loose branch ref", () => {
  fixture(root => {
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(root, ".git", "packed-refs"), "# pack-refs with: peeled fully-peeled\n" + commit + " refs/heads/main\n");
    assert.equal(resolveWebCommit(root), commit);
  });
});
test("reads detached HEAD and GitHub Actions SHA", () => {
  fixture(root => {
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "HEAD"), commit + "\n");
    assert.equal(resolveWebCommit(root), commit);
    const alternate = "a".repeat(40);
    assert.equal(resolveWebCommit(root, { GITHUB_SHA: alternate }), alternate);
  });
});
test("supports a git worktree .git pointer", () => {
  fixture(root => {
    mkdirSync(join(root, "real-git", "refs", "heads"), { recursive: true });
    writeFileSync(join(root, ".git"), "gitdir: real-git\n");
    writeFileSync(join(root, "real-git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(root, "real-git", "refs", "heads", "main"), commit + "\n");
    assert.equal(resolveWebCommit(root), commit);
  });
});
test("does not invent a revision if Git metadata is unavailable", () => {
  fixture(root => {
    assert.equal(resolveWebCommit(root), null);
    assert.equal(resolveWebCommit(root, { TNND_WEB_GIT_SHA: "not-a-sha" }), null);
  });
});
