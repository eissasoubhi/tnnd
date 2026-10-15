import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ADAPTIVE_WAIT_MS,
  conversationAttention,
  decayedActivityScore,
  followConversationAfterSignal,
  normalizeConversationActivities,
  observeConversationActivity,
  shouldKeepConversationInFocus
} from "../src/tinder-conversation-activity.ts";

const t0 = Date.parse("2026-10-16T20:00:00Z");
const at = ms => new Date(t0 + ms).toISOString();
const empty = () => ({
  activeConversationRef: null, activeConversationUntil: null, conversationActivities: []
});

test("opening a cold chat does not grant a fixed three-minute lease", () => {
  const focus = followConversationAfterSignal(empty(), "threadA", "opened", at(0));
  const info = conversationAttention(focus.conversationActivities, "threadA", t0);
  assert.equal(info.stage, "cold");
  assert.equal(info.waitMs, 2000);
  assert.equal(shouldKeepConversationInFocus(focus, "threadA", ["threadA"], t0 + 1000), true);
  assert.equal(shouldKeepConversationInFocus(focus, "threadA", ["threadA"], t0 + 3000), false);
});

test("two fast reciprocal replies earn longer attention without exceeding three minutes", () => {
  let state = followConversationAfterSignal(empty(), "threadA", "sent", at(0));
  state = followConversationAfterSignal(state, "threadA", "incoming", at(10_000));
  let attention = conversationAttention(state.conversationActivities, "threadA", t0 + 10_000);
  assert.equal(attention.stage, "reconnecting");
  assert.ok(attention.waitMs > 15_000 && attention.waitMs < 60_000);
  state = followConversationAfterSignal(state, "threadA", "sent", at(13_000));
  state = followConversationAfterSignal(state, "threadA", "incoming", at(23_000));
  attention = conversationAttention(state.conversationActivities, "threadA", t0 + 23_000);
  assert.equal(attention.stage, "very-active");
  assert.ok(attention.waitMs > 120_000 && attention.waitMs <= MAX_ADAPTIVE_WAIT_MS);
  assert.equal(shouldKeepConversationInFocus(state, "threadA", ["threadA"], t0 + 70_000), true);
  assert.equal(shouldKeepConversationInFocus(state, "threadA", ["threadA"], t0 + 200_000), false);
});

test("a slow response and subsequent silence lower the attention score", () => {
  let entries = observeConversationActivity([], "threadA", "sent", at(0));
  entries = observeConversationActivity(entries, "threadA", "incoming", at(10_000));
  entries = observeConversationActivity(entries, "threadA", "sent", at(20_000));
  entries = observeConversationActivity(entries, "threadA", "incoming", at(30_000));
  const fast = conversationAttention(entries, "threadA", t0 + 30_000);
  entries = observeConversationActivity(entries, "threadA", "sent", at(40_000));
  entries = observeConversationActivity(entries, "threadA", "incoming", at(40_000 + 6 * 60_000));
  const slow = conversationAttention(entries, "threadA", t0 + 40_000 + 6 * 60_000);
  assert.ok(slow.score < fast.score);
  assert.ok(slow.waitMs < fast.waitMs);
  assert.equal(decayedActivityScore(entries[0], t0 + 24 * 60 * 60_000), 0);
  assert.equal(conversationAttention(entries, "threadA", t0 + 24 * 60 * 60_000).stage, "cold");
});

test("multi-bubble incoming and outgoing events cannot simulate several rapid exchanges", () => {
  let entries = observeConversationActivity([], "threadA", "sent", at(0));
  entries = observeConversationActivity(entries, "threadA", "incoming", at(10_000));
  const firstScore = entries[0].score;
  entries = observeConversationActivity(entries, "threadA", "incoming", at(11_000));
  assert.equal(entries[0].score, firstScore + 3);
  assert.equal(entries[0].quickReplyStreak, 0);
  entries = observeConversationActivity(entries, "threadA", "sent", at(12_000));
  const scoreAfterSend = entries[0].score;
  entries = observeConversationActivity(entries, "threadA", "sent", at(13_000));
  assert.equal(entries[0].score, scoreAfterSend);
});

test("a previously active conversation is cold the following day", () => {
  let state = followConversationAfterSignal(empty(), "threadA", "sent", at(0));
  state = followConversationAfterSignal(state, "threadA", "incoming", at(10_000));
  state = followConversationAfterSignal(state, "threadA", "sent", at(13_000));
  state = followConversationAfterSignal(state, "threadA", "incoming", at(23_000));
  const tomorrow = followConversationAfterSignal(state, "threadA", "opened", at(24 * 60 * 60_000));
  assert.equal(conversationAttention(tomorrow.conversationActivities, "threadA", t0 + 24 * 60 * 60_000).score, 0);
  assert.equal(shouldKeepConversationInFocus(tomorrow, "threadA", ["threadA"], t0 + 24 * 60 * 60_000 + 3000), false);
});

test("attention never overrides thread identity, opt-in or manual navigation", () => {
  const state = followConversationAfterSignal(empty(), "threadA", "incoming", at(0));
  assert.equal(shouldKeepConversationInFocus(state, "threadB", ["threadA", "threadB"], t0 + 1000), false);
  assert.equal(shouldKeepConversationInFocus(state, "threadA", ["threadB"], t0 + 1000), false);
  assert.equal(shouldKeepConversationInFocus(state, "threadA", ["threadA"], t0 + 1000), true);
  assert.equal(shouldKeepConversationInFocus({...state, activeConversationUntil: "broken"}, "threadA", ["threadA"], t0 + 1000), false);
});

test("activity storage is bounded, rejects invalid data and ignores stale events", () => {
  const first = observeConversationActivity([], "threadA", "incoming", at(5000));
  const stale = observeConversationActivity(first, "threadA", "incoming", at(4000));
  assert.deepEqual(stale, first);
  const entries = normalizeConversationActivities([
    ...first,
    { ...first[0], lastInteractionAt: "not-a-date" },
    { ...first[0], ref: "../../secrets" },
    ...Array.from({ length: 250 }, (_, i) => ({ ...first[0], ref: "thread-" + i }))
  ]);
  assert.equal(entries.length, 200);
  assert.ok(entries.every(item => !item.ref.includes("/")));
  assert.deepEqual(normalizeConversationActivities({}), []);
});

test("watcher wiring uses adaptive signal tracking but retains existing send and reply gates", async () => {
  const {readFile} = await import("node:fs/promises");
  const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts", import.meta.url), "utf8");
  assert.match(runner, /shouldKeepConversationInFocus\(state,/);
  assert.match(runner, /shouldKeepConversationInFocus\(beforeNavigation,/);
  assert.match(runner, /followConversationAfterSignal\(latest, nextRef, "opened"\)/);
  assert.match(runner, /followConversationAfterSignal\(fresh, senderRef, phase\)/);
  assert.match(runner, /normalizeConversationActivities\(\[\.\.\.proposedAttention, \.\.\.rawAttention\]\)/);
  assert.match(runner, /replyInProgress/);
  assert.match(runner, /partitionExistingChatPermissions/);
  assert.doesNotMatch(runner, /extendActiveConversation\(/);
});
