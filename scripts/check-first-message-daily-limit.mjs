import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_FIRST_MESSAGE_DAILY_LIMIT,
  MAX_FIRST_MESSAGE_DAILY_LIMIT,
  firstMessageDailyLimit,
  firstMessageClaimsToday,
  hasReachedFirstMessageDailyLimit
} from "../src/tinder-first-message-daily-limit.ts";

test("legacy profiles default to five opener attempts, valid new setting is respected", () => {
  assert.equal(DEFAULT_FIRST_MESSAGE_DAILY_LIMIT, 5);
  assert.equal(MAX_FIRST_MESSAGE_DAILY_LIMIT, 100);
  for (const invalid of [undefined, null, "", 0, -1, 1.5, 101, NaN, Infinity, "50"]) {
    assert.equal(firstMessageDailyLimit(invalid), 5);
  }
  for (const n of [1, 5, 10, 20, 50, 100]) assert.equal(firstMessageDailyLimit(n), n);
});

test("daily opener claims persist until UTC day changes; failed/uncertain sends still count", () => {
  const now = Date.parse("2026-10-14T00:20:00Z");
  const claims = {
    old: Date.parse("2026-10-13T23:55:00Z"),
    attempted: Date.parse("2026-10-14T00:01:00Z"),
    uncertain: Date.parse("2026-10-14T00:02:00Z"),
    corrupt: Number.MAX_VALUE
  };
  assert.equal(firstMessageClaimsToday(claims, now), 2);
  assert.equal(hasReachedFirstMessageDailyLimit(claims, 2, now), true);
  assert.equal(hasReachedFirstMessageDailyLimit(claims, 3, now), false);
  assert.equal(hasReachedFirstMessageDailyLimit(claims, 5, now), false);
  assert.equal(firstMessageClaimsToday(claims, Date.parse("2026-10-15T00:00:00Z")), 0);
});

test("options, runner and backend share one cap; replies use a distinct daily counter", async () => {
  const read = async (file) => readFile(new URL("../" + file, import.meta.url), "utf8");
  const [types, storage, options, html, popup, popupHtml, runner, background, content, bundle] = await Promise.all([
    "src/types.ts", "src/storage.ts", "src/options.ts", "public/options.html",
    "src/popup.ts", "public/popup.html", "src/tinder-global-new-match-runner.ts",
    "src/background.ts", "src/content.ts", "src/profile-bundle.ts"
  ].map(read));
  assert.match(types, /maxFirstMessagesPerDay: number/);
  assert.match(storage, /maxFirstMessagesPerDay: DEFAULT_FIRST_MESSAGE_DAILY_LIMIT/);
  assert.match(storage, /maxFirstMessagesPerDay: firstMessageDailyLimit\(savedAutomation\.maxFirstMessagesPerDay\)/);
  assert.match(options, /maxFirstMessagesPerDay: rawFirstMessageLimit/);
  assert.match(options, /f\.maxFirstMessagesPerDay\.value = String\(firstMessageDailyLimit/);
  assert.match(html, /id="maxFirstMessagesPerDay" type="number" min="1" max="100" step="1" value="5" required/);
  assert.match(popupHtml, /id="newMatchLimitHint"/);
  assert.match(popup, /firstMessageDailyLimit\(\(await getConfig\(\)\)\.automation\.maxFirstMessagesPerDay\)/);
  assert.match(runner, /firstMessageDailyLimit\(config\.automation\.maxFirstMessagesPerDay\)/);
  assert.match(runner, /freshLimit = firstMessageDailyLimit\(freshConfig\.automation\.maxFirstMessagesPerDay\)/);
  assert.match(background, /hasReachedFirstMessageDailyLimit\(claims, config\.automation\.maxFirstMessagesPerDay\)/);
  assert.match(background, /hasReachedFirstMessageDailyLimit\(entries, currentConfig\.automation\.maxFirstMessagesPerDay\)/);
  assert.match(bundle, /maxFirstMessagesPerDay: firstMessageDailyLimit\(automation\.maxFirstMessagesPerDay\)/);
  const opener = content.slice(content.indexOf("async function startFirstMessage("), content.indexOf("chrome.runtime.onMessage.addListener", content.indexOf("async function startFirstMessage(")));
  assert.match(opener, /TNND_GET_FIRST_MESSAGE_PERMISSION/);
  assert.match(opener, /TNND_CLAIM_FIRST_MESSAGE/);
  assert.doesNotMatch(opener, /freshState\.dailyCount \+= 1|freshState\.dailyCount >=/);
  assert.match(content, /state\.dailyCount >= config\.automation\.maxAutoRepliesPerDay/);
});
