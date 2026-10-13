import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { armNewMatchObservation, observeNewMatchLinks, finishNewMatchAttempt } from "../src/tinder-new-match-observation.ts";

test("confirming a new match never causes two sends for the same Tinder thread", () => {
  let state = armNewMatchObservation(["old-a","old-b"],"user-1","2026-10-13T12:00:00Z");
  state = observeNewMatchLinks(state,["fresh-a","old-a","old-b"],"2026-10-13T12:00:05Z");
  state = observeNewMatchLinks(state,["fresh-a","old-a","old-b"],"2026-10-13T12:00:35Z");
  assert.deepEqual(state.pendingRefs,["fresh-a"]);
  state = finishNewMatchAttempt(state,"fresh-a",true,"sent");
  assert.deepEqual(state.completedRefs,["fresh-a"]);
  assert.deepEqual(state.pendingRefs,[]);
  state = observeNewMatchLinks(state,["fresh-a","old-a","old-b"],"2026-10-13T12:01:35Z");
  assert.deepEqual(state.pendingRefs,[]);
});

test("new-match sending is account-scoped, individually gated, and stopped synchronously", async () => {
  const backend = await readFile(new URL("../src/tinder-new-match-background.ts",import.meta.url),"utf8");
  const runner = await readFile(new URL("../src/tinder-global-new-match-runner.ts",import.meta.url),"utf8");
  const content = await readFile(new URL("../src/content.ts",import.meta.url),"utf8");
  const rootBackground = await readFile(new URL("../src/background.ts",import.meta.url),"utf8");
  assert.match(backend,/session\.user\.id !== state\.userId/);
  assert.match(backend,/newMatchSendPermission/);
  assert.match(backend,/autoSendEnabled/);
  assert.match(backend,/chrome\.alarms\.clear/);
  assert.match(runner,/firstMessageDailyLimit\(config\.automation\.maxFirstMessagesPerDay\)/);
  assert.match(runner,/hasReachedFirstMessageDailyLimit\(claims \?\? \{\}, limit\)/);
  assert.match(runner,/await prepareNewMatch/);
  assert.match(runner,/getChatSettings/);
  assert.match(runner,/pendingRefs/);
  assert.match(runner,/TNND_AUTO_START_NEW_MATCH/);
  assert.doesNotMatch(runner,/adapter\.send\(/);
  assert.match(rootBackground,/TNND_GET_NEW_MATCH_SEND_PERMISSION/);
  assert.match(content,/mode === "global-new"/);
  assert.match(content,/TNND_GET_NEW_MATCH_SEND_PERMISSION/);
  assert.match(content,/TNND_CLAIM_FIRST_MESSAGE/);
  assert.match(content,/await adapter\.send\(opener\)/);
});
