import assert from "node:assert/strict";
import test from "node:test";
import { armNewMatchObservation, emptyNewMatchState, isNewMatchObservationState, observeNewMatchLinks, stopNewMatchObservation } from "../src/tinder-new-match-observation.ts";
import { classifyVisibleTinderSidebarRows } from "../src/tinder-visible-thread-links.ts";

test("future-match mode must be armed by an identified user with visible old matches", () => {
  assert.equal(emptyNewMatchState().enabled, false);
  assert.throws(() => armNewMatchObservation(["old1"], "user-1"), /two visible match tiles/);
  const armed = armNewMatchObservation(["old1", "old2", "old1"], "user-1");
  assert.equal(armed.enabled, true);
  assert.equal(armed.autoSendEnabled, true);
  assert.equal(armed.userId, "user-1");
  assert.deepEqual(armed.seenRefs, ["old1", "old2"]);
  assert.equal(isNewMatchObservationState(armed), true);
  assert.equal(stopNewMatchObservation(armed).autoSendEnabled, false);
});

test("only a stable new tile inserted at the front of the original match list becomes eligible", () => {
  const armed = armNewMatchObservation(["old1", "old2", "old3"], "user-1", "2026-10-13T10:00:00Z");
  const first = observeNewMatchLinks(armed, ["new1","old1","old2","old3"], "2026-10-13T10:01:00Z");
  assert.deepEqual(first.pendingRefs, []);
  assert.deepEqual(first.candidates.map(x => x.ref), ["new1"]);
  const confirmed = observeNewMatchLinks(first, ["new1","old1","old2","old3"], "2026-10-13T10:01:20Z");
  assert.deepEqual(confirmed.pendingRefs, ["new1"]);
  assert.deepEqual(confirmed.candidates, []);
  assert.deepEqual(observeNewMatchLinks(confirmed, ["new1","old1","old2"], "2026-10-13T10:02:00Z").pendingRefs, ["new1"]);
});

test("old lazy loaded or ambiguous match order is never queued for sending", () => {
  const armed = armNewMatchObservation(["old1","old2"], "user-1");
  assert.deepEqual(observeNewMatchLinks(armed, ["old1","old2","older-loaded"]).pendingRefs, []);
  assert.deepEqual(observeNewMatchLinks(armed, ["unrelated"]).pendingRefs, []);
  assert.deepEqual(observeNewMatchLinks(armed, ["new1","new2","new3","new4","old1"]).pendingRefs, []);
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
