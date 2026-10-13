import assert from "node:assert/strict";
import test from "node:test";
import { armNewMatchObservation, emptyNewMatchState, isNewMatchObservationState, observeNewMatchLinks, stopNewMatchObservation } from "../src/tinder-new-match-observation.ts";
import { classifyVisibleTinderSidebarRows } from "../src/tinder-visible-thread-links.ts";

test("future observation has its own off-by-default mode and baseline", () => {
  assert.equal(emptyNewMatchState().enabled,false);
  const armed=armNewMatchObservation(["existing-1","existing-2","existing-1"]);
  assert.deepEqual(armed.seenRefs,["existing-1","existing-2"]);
  assert.deepEqual(armed.pendingRefs,[]);
  assert.equal(isNewMatchObservationState(armed),true);
  const observed=observeNewMatchLinks(armed,["existing-2","appeared-after-start"]);
  assert.deepEqual(observed.pendingRefs,["appeared-after-start"]);
  assert.deepEqual(observeNewMatchLinks(observed,["appeared-after-start"]).pendingRefs,["appeared-after-start"]);
  assert.deepEqual(observeNewMatchLinks(stopNewMatchObservation(observed),["another"]).pendingRefs,["appeared-after-start"]);
});

test("newly observed links cannot silently send messages", async () => {
  const fs=await import("node:fs/promises");
  const background=await fs.readFile(new URL("../src/tinder-new-match-background.ts",import.meta.url),"utf8");
  const content=await fs.readFile(new URL("../src/content.ts",import.meta.url),"utf8");
  assert.doesNotMatch(background,/adapter\.send|TNND_START_FIRST_MESSAGE|generateSuggestions/);
  assert.match(content,/TNND_NEW_MATCH_LINKS_SEEN/);
  assert.match(background,/popupSender\(sender\)/);
  assert.match(background,/serialized\(/);
});

test("Matches and Messages tabs are classified from their visible rows, independent of URL", () => {
  // Based on structural counts in two redacted Tinder diagnostics. No user profile data.
  assert.equal(classifyVisibleTinderSidebarRows(0, 60), "messages");
  assert.equal(classifyVisibleTinderSidebarRows(28, 0), "matches");
  assert.equal(classifyVisibleTinderSidebarRows(0, 0), "unknown");
  assert.equal(classifyVisibleTinderSidebarRows(28, 2), "unknown");
});

test("new match tracking uses match tiles and accepts Tinder's retained chat URL", async () => {
  const { readFile } = await import("node:fs/promises");
  const links = await readFile(new URL("../src/tinder-visible-thread-links.ts", import.meta.url), "utf8");
  const bridge = await readFile(new URL("../src/chat-bridge.ts", import.meta.url), "utf8");
  const observer = await readFile(new URL("../src/content.ts", import.meta.url), "utf8");
  const background = await readFile(new URL("../src/tinder-new-match-background.ts", import.meta.url), "utf8");
  assert.ok(links.includes('a.matchListItem[href*="/app/messages/"]'));
  assert.ok(links.includes('a.messageListItem[href*="/app/messages/"]'));
  assert.ok(links.includes('detectVisibleTinderSidebarTab(root) !== "matches"'));
  assert.ok(bridge.includes('detectVisibleTinderSidebarTab() !== "matches"'));
  assert.ok(observer.includes('detectVisibleTinderSidebarTab() !== "matches"'));
  assert.ok(background.includes('url.pathname.startsWith("/app/messages/")'));
  assert.doesNotMatch(background, /adapter.send|GENERATE_SUGGESTIONS/);
});
