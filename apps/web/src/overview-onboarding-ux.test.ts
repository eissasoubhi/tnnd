import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(fileURLToPath(import.meta.url));
const setup = readFileSync(resolve(root, "setup-guidance-panel.ts"), "utf8");
const guide = readFileSync(resolve(root, "first-run-guide.ts"), "utf8");
const css = readFileSync(resolve(root, "neo-bento.css"), "utf8");

test("completed setup is compact without removing the checklist or actions", () => {
  assert.match(setup, /setup-progress-details/);
  assert.match(setup, /setupDetails\.open = !complete/);
  assert.match(setup, /id="setup-ready-actions"/);
  assert.match(setup, /href="#conversation-panel"/);
  assert.match(setup, /href="#personal-memory-panel"/);
  assert.match(css, /#app #setup-guidance-panel \.setup-ready-link/);
});

test("guided tour respects completion and explicit reopen", () => {
  assert.match(guide, /shouldShowGuidedTour/);
  assert.match(guide, /tnnd:setup-completion-changed/);
  assert.match(guide, /reopenedManually = true/);
  assert.match(guide, /updateGuideVisibility/);
});
