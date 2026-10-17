import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { safeBulkRefs, nextBulkSyncRef, bulkSyncCounts, canContinueBulkSync } from "../src/tinder-bulk-sync-policy.ts";
const state = () => ({
  active: true, userId: "owner-A", tabId: 41, refs: ["thread-one","thread-two","thread-three"],
  done: ["thread-one"], failed: { "thread-two": "navigation_not_confirmed" }, partial:["thread-one"],
  initialRef:"original-chat", lastRef:"thread-one", startedAt:"2026-10-17T12:00:00Z", updatedAt:"2026-10-17T12:00:00Z"
});
test("only real bounded-looking exact thread refs are admitted, deduplicated and capped", () => {
  assert.deepEqual(safeBulkRefs(["thread-one","thread-one","a","../other","thread-two","thread-three"],2),
    ["thread-one","thread-two"]);
  assert.deepEqual(safeBulkRefs(null), []);
});
test("progress handles completed, failed, partial and pending without double-counting", () => {
  assert.deepEqual(bulkSyncCounts(state()), { selected:3, completed:1, failed:1,partial:1,pending:1 });
  assert.equal(nextBulkSyncRef(state()), "thread-three");
  assert.equal(nextBulkSyncRef({ ...state(), done:["thread-one","thread-three"] }), null);
});
test("bulk import never runs after account/tab switch, manual navigation or enabled auto-chat", () => {
  const allowed = { userId:"owner-A",tabId:41,currentRef:"thread-one",automationEnabled:false,otherRunnerActive:false };
  assert.equal(canContinueBulkSync(state(),allowed), null);
  assert.equal(canContinueBulkSync(state(),{...allowed,userId:"owner-B"}),"account_or_tab_changed");
  assert.equal(canContinueBulkSync(state(),{...allowed,currentRef:"another-thread"}),"manual_tinder_navigation_detected");
  assert.equal(canContinueBulkSync(state(),{...allowed,automationEnabled:true}),"automatic_runner_must_be_disabled");
  assert.equal(canContinueBulkSync(state(),{...allowed,otherRunnerActive:true}),"automatic_runner_must_be_disabled");
});
test("source contract guarantees no send and preserves existing statuses", () => {
  const background = readFileSync(new URL("../src/tinder-read-only-bulk-sync-background.ts",import.meta.url),"utf8");
  const content = readFileSync(new URL("../src/content.ts",import.meta.url),"utf8");
  const bridge = readFileSync(new URL("../src/chat-bridge.ts",import.meta.url),"utf8");
  assert.match(background, /disable_all_auto_chat_before_read_only_import/);
  assert.match(background, /TNND_BULK_SYNC_READONLY_NAVIGATE/);
  assert.match(background, /TNND_GET_VISIBLE_THREAD_MESSAGES/);
  assert.match(background, /index === 0 && !existing/);
  assert.match(background, /conversation_import_failed/);
  assert.doesNotMatch(background, /TNND_START_FIRST_MESSAGE|TNND_AUTO_START_NEW_MATCH|TNND_CLAIM_FIRST_MESSAGE/);
  assert.match(content, /unsent_message_draft_present/);
  assert.match(bridge, /TNND_BULK_SYNC_VISIBLE_MESSAGE_REFS/);
});

test("passive inbox collection is opt-in, account-scoped and never reads message bodies", () => {
  const background = readFileSync(new URL("../src/tinder-read-only-bulk-sync-background.ts",import.meta.url),"utf8");
  const content = readFileSync(new URL("../src/content.ts",import.meta.url),"utf8");
  const popup = readFileSync(new URL("../src/tinder-bulk-sync-popup.ts",import.meta.url),"utf8");
  assert.match(popup, /TNND_BULK_SYNC_COLLECT_START/);
  assert.match(popup, /TNND_BULK_SYNC_COLLECT_STOP/);
  assert.match(content, /visibleTinderMessageThreadRefs\(\)/);
  assert.match(content, /TNND_BULK_SYNC_OBSERVE_REFS/);
  assert.ok(background.includes("!state?.collecting && !prefs.autoCollectLoaded"));
  assert.ok(background.includes("state.userId !== session.user.id"));
  assert.ok(background.includes("sender.tab?.id !== state.tabId"));
  assert.ok(background.includes("safeBulkRefs(input.refs,500)"));
  assert.match(background, /collecting: false, stopReason: null/);
  assert.doesNotMatch(background, /upload-artifact|TNND_START_FIRST_MESSAGE/);
});
