import assert from "node:assert/strict";
import test from "node:test";
import { firstMessageAttemptKey, firstMessageBlocker, firstMessageContext } from "../src/tinder-first-message.ts";
import { groundedOpenerFragments, sameOpenerThreadUninterrupted } from "../src/tinder-opener-fragments.ts";
import { buildSystemInstruction, buildUserPrompt } from "../src/prompt.ts";
const promptTestConfig = {
  tone: "warm", flirtLevel: 1, humorLevel: 20, emojiLevel: "low", messageLength: "short",
  languages: { fr: 100, darija: 0, en: 0 }, preferredWords: "", avoidedWords: "",
  extraInstructions: "", identity: { contactPreference: "stay-on-tinder", instagram: "", whatsapp: "" }
};

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
  assert.match(content, /input\.type !== "TNND_START_FIRST_MESSAGE"/);
  assert.match(content, /input\.type !== "TNND_AUTO_START_NEW_MATCH"/);
  assert.match(content, /firstMessageAttemptKey\(conversationRef\)/);
  assert.match(content, /await saveState\(freshState\)/);
  assert.match(content, /await adapter\.send\(part\)/);
  assert.match(content, /const openerParts = groundedOpenerFragments\(opener\)/);
  assert.match(content, /sameOpenerThreadUninterrupted\(adapter\.readVisibleMessages\(\)/);
  assert.match(content, /randomCadenceSeconds\(config\.automation\)/);
  assert.match(content, /tnnd-opener-\$\{attemptedAt\}-\$\{index \+ 1\}/);
  assert.match(background, /TNND_GET_FIRST_MESSAGE_PERMISSION/);
  assert.match(background, /backend\.conversationStatus !== "active"/);
  assert.match(background, /savedMessageCount === 0/);
  assert.match(content, /TNND_CLAIM_FIRST_MESSAGE/);
  assert.match(background, /FIRST_MESSAGE_CLAIMS_KEY/);
  assert.doesNotMatch(content.slice(content.indexOf("async function scan()"), content.indexOf("async function startFirstMessage(")), /startFirstMessage\(/);
});

test("one opener becomes separate short grounded Tinder bubbles without fabricated admiration", () => {
  assert.deepEqual(
    groundedOpenerFragments("salut, bien ou bien ? ton profil m'a fait sourire"),
    ["salut", "bien ou bien ?"]
  );
  assert.deepEqual(
    groundedOpenerFragments("Salut\nBien ou bien ?\nTon profil m'a fait sourire"),
    ["Salut", "Bien ou bien ?"]
  );
  assert.deepEqual(groundedOpenerFragments("Salut\nÇa va ?"), ["Salut", "Ça va ?"]);
  assert.deepEqual(groundedOpenerFragments("Salut\nBien ou bien ?\nTu fais quoi de beau ?"), ["Salut", "Bien ou bien ?", "Tu fais quoi de beau ?"]);
  assert.deepEqual(groundedOpenerFragments("Ton profil m'a fait sourire"), ["Salut", "Bien ou bien ?"]);
  assert.deepEqual(groundedOpenerFragments(""), ["Salut", "Bien ou bien ?"]);
  assert.ok(groundedOpenerFragments("Hey\nJ'ai adoré ta photo\nHow's your day?").every(fragment => !fragment.includes("photo")));
});

test("burst stops if match replied, human sent a message, or transcript is unavailable", () => {
  assert.equal(sameOpenerThreadUninterrupted([{ direction: "me", text: "Salut" }], "Salut"), true);
  assert.equal(sameOpenerThreadUninterrupted([{ direction: "me", text: "Salut" }, { direction: "them", text: "Coucou" }], "Salut"), false);
  assert.equal(sameOpenerThreadUninterrupted([{ direction: "me", text: "Autre message" }], "Salut"), false);
  assert.equal(sameOpenerThreadUninterrupted([], "Salut"), false);
});

test("opener Gemini prompts demand sequential fragments, forbid fabricated profile reactions", async () => {
  const built = buildSystemInstruction(promptTestConfig, 1, "opener");
  const user = buildUserPrompt("No visible match bio", "opener");
  assert.match(built, /2 or 3 very short fragments/);
  assert.match(built, /ton profil m'a fait sourire/);
  assert.match(user, /2 or 3 short lines/);
  assert.match(user, /profile reaction/);
  const api = await (await import("node:fs/promises")).readFile(new URL("../apps/api/src/extension-suggestions.ts", import.meta.url),"utf8");
  assert.match(api, /The lines will be sent as separate Tinder bubbles/);
  assert.match(api, /profile made the sender smile/);
});

test("opener burst is one pre-send claim, then each bubble is synchronized and gated before continuation", async () => {
  const content = await (await import("node:fs/promises")).readFile(new URL("../src/content.ts", import.meta.url),"utf8");
  const code = content.slice(content.indexOf("async function startFirstMessage("), content.indexOf("chrome.runtime.onMessage.addListener", content.indexOf("async function startFirstMessage(")));
  assert.equal(code.match(/TNND_CLAIM_FIRST_MESSAGE/g)?.length, 1);
  assert.match(code, /for \(const \[index, part\] of openerParts.entries\(\)\)/);
  assert.match(code, /sameOpenerThreadUninterrupted\(adapter.readVisibleMessages\(\), openerParts\[index - 1\]\)/);
  assert.match(code, /await backendAllowsAutomaticReply\(conversationRef\)/);
  assert.match(code, /await getChatAutomationEnabled\(threadKey\)/);
  assert.match(code, /await syncConversationDelta\(conversationRef, \[\{/);
  assert.match(code, /new Promise\(\(resolve\) => setTimeout\(resolve, gap \* 1000\)\)/);
  assert.doesNotMatch(code, /freshState.dailyCount\s*\+=\s*1/);
});
