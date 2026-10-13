import assert from "node:assert/strict";
import test from "node:test";
import { firstMessageAttemptKey, firstMessageBlocker, firstMessageContext } from "../src/tinder-first-message.ts";

const ready = {
  sameThread: true,
  composerFound: true,
  visibleMessageCandidates: 0,
  savedConversationMessages: 0,
  aiManagedAndActive: true,
  globalAutomationEnabled: true,
  chatAutomationEnabled: true,
  insideQuietHours: false,
  belowDailyLimit: true,
  alreadyAttempted: false
};

test("an explicit opener is eligible only for the selected, truly empty AI-managed active chat", () => {
  assert.equal(firstMessageBlocker(ready), null);
  const cases = {
    sameThread: ["wrong_thread", false],
    composerFound: ["composer_missing", false],
    visibleMessageCandidates: ["messages_present", 1],
    savedConversationMessages: ["backend_history_present", 1],
    aiManagedAndActive: ["ai_management_not_active", false],
    globalAutomationEnabled: ["global_automation_off", false],
    chatAutomationEnabled: ["chat_automation_off", false],
    insideQuietHours: ["quiet_hours", true],
    belowDailyLimit: ["daily_limit", false],
    alreadyAttempted: ["already_attempted", true]
  };
  for (const [key, [blocker, value]] of Object.entries(cases)) {
    assert.equal(firstMessageBlocker({ ...ready, [key]: value }), blocker, key);
  }
});

test("opener context is grounded in observed Tinder data and avoids fake dialogue", () => {
  const context = firstMessageContext(" Leia ", 30);
  assert.match(context, /no previous messages/);
  assert.match(context, /Leia/);
  assert.match(context, /30/);
  assert.doesNotMatch(firstMessageContext(undefined, 12), /12/);
  assert.match(firstMessageContext(undefined), /not confirmed/);
  assert.equal(firstMessageAttemptKey("thread-1"), "first-message:thread-1");
});

test("the first-message event is a user-triggered popup action, not a background scan", async () => {
  const { readFile } = await import("node:fs/promises");
  const popup = await readFile(new URL("../src/popup.ts", import.meta.url), "utf8");
  const content = await readFile(new URL("../src/content.ts", import.meta.url), "utf8");
  const background = await readFile(new URL("../src/background.ts", import.meta.url), "utf8");
  assert.match(popup, /startFirstMessage\.addEventListener\("click"/);
  assert.match(popup, /window\.confirm\(/);
  assert.match(content, /if \(input\.type !== "TNND_START_FIRST_MESSAGE"\) return false/);
  assert.match(content, /firstMessageAttemptKey\(conversationRef\)/);
  assert.match(content, /await saveState\(freshState\)/);
  assert.match(content, /await adapter\.send\(opener\)/);
  assert.match(background, /TNND_GET_FIRST_MESSAGE_PERMISSION/);
  assert.match(background, /backend\.conversationStatus !== "active"/);
  assert.match(background, /count === 0/);
  assert.doesNotMatch(content.slice(content.indexOf("async function scan()"), content.indexOf("function scheduleScan()")), /startFirstMessage\(/);
});
