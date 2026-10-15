import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const base = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(resolve(base,"personal-memory-panel.ts"),"utf8");
const css = readFileSync(resolve(base,"neo-bento.css"),"utf8");

test("memories distinguish no saved stories from no filter matches and allow reset", () => {
  assert.match(panel,/id="memory-clear-filters"/);
  assert.match(panel,/No stories match the current search or status/);
  assert.match(panel,/No stories saved yet/);
  assert.match(panel,/clearFilters\.addEventListener\("click"/);
  assert.match(panel,/applyMemoryFilters\(\)/);
  assert.match(css,/#app #personal-memory-panel #memory-clear-filters/);
});
test("filter changes do not silently discard an unsaved review", () => {
  assert.match(panel,/if \(hasUnsavedChanges\(\)\) \{/);
  assert.match(panel,/Unsaved edits are still open below/);
  assert.match(panel,/const item = filteredItems\(\)\.find/);
});
test("account changes wipe the old memory editor and ignore late API results", () => {
  assert.match(panel,/displayedSessionToken/);
  assert.match(panel,/source\.value = ""/);
  assert.match(panel,/workingDraft = null/);
  assert.match(panel,/isLatestSessionResponse\(requestId, refreshSequence, session\.token, readSession\(\)\?\.token\)/);
});
