import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("watch-only and first-message permissions remain separate explicit actions", async () => {
  const [runner, popup, html] = await Promise.all([
    read("src/tinder-global-existing-runner.ts"), read("src/popup.ts"), read("public/popup.html")
  ]);
  assert.match(html, /id="startReplyWatcher"[^>]*>Watch conversations \+ matches \(no first messages\)/);
  assert.match(html, /id="startAutoMatchWatcher"[^>]*>Enable automatic first messages/);
  assert.match(html, /href="#globalNewMatchCard">Start AI on existing matches<\/a>/);
  assert.match(html, /id="startExistingMatchBatch"[^>]*>Start AI on existing matches/);
  assert.match(popup, /window\.confirm\(/);
  assert.match(popup, /TNND_GLOBAL_WATCHER_AUTO_START/);
  assert.match(popup, /startAutoWatcher\.disabled = state\.enabled && !\(watcher && !state\.autoOpenersEnabled\)/);
  assert.match(runner, /mode === "watcher" && autoOpenersEnabled && !current\.autoOpenersEnabled/);
  assert.match(runner, /autoOpenersEnabled: true/);
  assert.match(runner, /new Set\(snapshot\.refs\.filter/);
  assert.match(runner, /sendSingleWatchedMatch/);
});

test("upgrading running watcher preserves verified inventory and fails closed on changed sessions", async () => {
  const runner = await read("src/tinder-global-existing-runner.ts");
  assert.match(runner, /const fresh = await load\(\);\s*if \(!fresh\.enabled \|\| fresh\.mode !== "watcher"/);
  assert.match(runner, /fresh\.startedAt !== current\.startedAt/);
  assert.match(runner, /tinderTabs\.length !== 1/);
  assert.match(runner, /waitForTinderContentBridge\(current\.tabId\)/);
  assert.match(runner, /other\?\.enabled/);
  assert.match(runner, /autoOpenersEnabled: state\.enabled && sameSession && state\.mode === "watcher"/);
  assert.doesNotMatch(runner, /startExistingRunner\(false, "watcher", true\).*?chrome\.tabs\.create/s);
});

test("existing match batch retains its own explicit send and empty-thread checks", async () => {
  const [popup, runner, html] = await Promise.all([
    read("src/popup.ts"), read("src/tinder-global-new-match-runner.ts"), read("public/popup.html")
  ]);
  assert.match(popup, /TNND_EXISTING_MATCHES_START/);
  assert.match(popup, /START first AI messages to up to/);
  assert.match(runner, /await prepareNewMatch\(ref, session\.token\)/);
  assert.match(runner, /newMatchSendPermission\(ref, tabId\)/);
  assert.match(runner, /hasReachedFirstMessageDailyLimit/);
  assert.match(html, /Stop the watcher first if it is active/);
});
