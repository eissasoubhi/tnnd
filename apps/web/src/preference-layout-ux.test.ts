import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const base = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(resolve(base, "main.ts"), "utf8");
const css = readFileSync(resolve(base, "neo-bento.css"), "utf8");

test("settings are grouped from the design model and unknown controls remain discoverable", () => {
  assert.match(main, /import \{ preferenceSections \} from "\.\/preference-sections"/);
  assert.match(main, /for \(const group of preferenceSections\)/);
  assert.match(main, /title\.textContent = "Other preferences"/);
  assert.doesNotMatch(main, /other\?\.append\(\.\.\.Array\.from\(original\.children\)\)/);
});

test("save action has a persistent accessible status beside the button", () => {
  assert.match(main, /class="preferences-save-bar"/);
  assert.match(main, /id="preferences-save-feedback" role="status" aria-live="polite"/);
  assert.match(main, /preferencesSave\.disabled = true/);
  assert.match(main, /preferencesSave\.disabled = false/);
  assert.match(css, /#app #profile-settings \.preferences-save-bar/);
});
