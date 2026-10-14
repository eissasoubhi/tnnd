import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const directory = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(resolve(directory, "main.ts"), "utf8");
const css = readFileSync(resolve(directory, "neo-bento.css"), "utf8");

test("dating goal details explain the intent in an accessible, optional field", () => {
  assert.match(main, /<label for="dating-goal-details">What are you looking for\?/);
  assert.match(main, /<textarea id="dating-goal-details"[^>]+aria-describedby="dating-goal-help"/);
  assert.match(main, /<p id="dating-goal-help"/);
  assert.match(main, /Need inspiration\? Try an example/);
  assert.match(main, /data-goal-example="open"/);
  assert.match(main, /data-goal-example="serious"/);
  assert.match(main, /data-goal-example="casual"/);
});

test("goal details are loaded and saved with the rest of preferences in one backend mutation", () => {
  assert.match(main, /datingGoalDetails\.value = preferences\.datingGoalDetails \?\? ""/);
  assert.match(main, /datingGoalDetails: datingGoalDetails\.value/);
  assert.match(main, /targetCities: targetCities\.value/);
  assert.match(main, /id="target-cities"/);
  assert.doesNotMatch(main, /import\("\.\/dating-goal-details-panel"\)/);
  assert.match(main, /ids: \["dating-goal", "dating-goal-details", "disclosure-strategy"\]/);
  assert.match(main, /field\?\.closest\("\.dating-goal-editor"\)/);
});

test("examples never auto-save or silently overwrite an existing description", () => {
  assert.match(main, /window\.confirm\("Replace your current description with this example\?"\)/);
  assert.match(main, /datingGoalDetails\.value = example/);
  assert.match(main, /datingGoalDetails\.disabled/);
  assert.match(css, /#profile-settings \.dating-goal-editor/);
  assert.match(css, /#profile-settings \.dating-goal-example-actions/);
  assert.match(css, /overflow-wrap: anywhere/);
});
