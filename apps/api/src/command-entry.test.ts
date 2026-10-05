import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDirectCommand } from "./command-entry.js";

test("detects direct command when argv path is relative", () => {
  const argv1 = "src/migration-command.ts";
  const metaUrl = pathToFileURL(resolve(argv1)).href;
  assert.equal(isDirectCommand(metaUrl, argv1), true);
});

test("rejects imported command modules", () => {
  const metaUrl = pathToFileURL(resolve("src/migration-command.ts")).href;
  assert.equal(isDirectCommand(metaUrl, "src/other-command.ts"), false);
});

test("rejects missing argv path", () => {
  assert.equal(isDirectCommand("file:///tmp/example.ts", undefined), false);
});
