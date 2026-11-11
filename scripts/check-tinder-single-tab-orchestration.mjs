import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { reconcileExistingIndex, observeTinderInbox, markThreadChecked, isExistingThreadIndex } from "../src/tinder-existing-thread-index.ts";
import { nextWatchedReply, pendingWatchedReplies, nextImmediateWatchedReply, pendingImmediateWatcherReplies } from "../src/tinder-reply-watcher.ts";
import { nextSingleTabRotation, INBOX_SCAN_INTERVAL_MS, INBOX_MIN_DWELL_MS } from "../src/tinder-single-tab-rotation.ts";

const at = "2026-11-07T10:00:00.000Z";
const later = "2026-11-07T10:45:00.000Z";
test("Tinder-first inventory includes unsynced old messages without unread badges", () => {
  const stored = reconcileExistingIndex(null, "user-A", [
    { ref: "known-001", lastMessageAt: at, lastMessageDirection: "incoming" },
    { ref: "known-002", lastMessageAt: at, lastMessageDirection: "outgoing" }
  ], at);
  const withTinder = observeTinderInbox(stored, ["AmiraThread03", "known-002", "otherThread9"], [], at);
  assert.equal(isExistingThreadIndex(withTinder), true);
  assert.equal(withTinder.threads[0].ref, "AmiraThread03");
  assert.equal(withTinder.threads[0].lastMessageDirection, null,
    "Unknown Tinder-only thread may not be assumed already answered");
  assert.equal(pendingWatchedReplies(withTinder), 3,
    "Old incoming, Amira and an unsynced non-unread Tinder thread all need inspection");
  assert.equal(nextWatchedReply(withTinder), "known-001",
    "Known unanswered incoming messages outrank not-yet-inspected Tinder-only threads");
  const first = markThreadChecked(withTinder, "known-001", at);
  assert.equal(nextWatchedReply(first), "AmiraThread03");
  const reviewed = markThreadChecked(first, "AmiraThread03", at);
  const rescanned = reconcileExistingIndex(reviewed, "user-A",
    [{ ref: "known-001", lastMessageAt: at, lastMessageDirection: "incoming" }], at);
  assert.ok(rescanned.threads.some(thread => thread.ref === "AmiraThread03"),
    "A Tinder-only conversation must survive a DB refresh that does not know it");
  assert.notEqual(nextWatchedReply(rescanned), "AmiraThread03",
    "Do not repeatedly reopen an unchanged unsynced chat right after inspecting it");
  const due = reconcileExistingIndex(rescanned, "user-A",
    [{ ref: "known-001", lastMessageAt: at, lastMessageDirection: "incoming" }], later);
  assert.equal(nextWatchedReply(due), "otherThread9",
    "Never starve an unsynced conversation that has not been inspected even once");
  assert.equal(nextWatchedReply(markThreadChecked(due, "otherThread9", later)),
    "AmiraThread03", "Periodic recheck also revisits previously inspected Tinder-only chats");
});

test("Tinder sources win over a large DB inventory without inventing approvals", () => {
  const rows = Array.from({ length: 500 }, (_, index) => ({
    ref: "dbthread" + String(index).padStart(4, "0"),
    lastMessageAt: at, lastMessageDirection: "outgoing"
  }));
  const db = reconcileExistingIndex(null, "user-A", rows, at);
  const tinder = observeTinderInbox(db, ["AmiraThread03"], [], at);
  assert.equal(tinder.threads.length, 500);
  assert.equal(tinder.threads[0].ref, "AmiraThread03");
  assert.equal(tinder.threads[0].lastMessageDirection, null);
});

test("single-tab rotation prioritizes old pending chats and waits for a safe Matches scan", () => {
  const t = Date.parse(at);
  assert.equal(nextSingleTabRotation({
    owner: "swipe", pendingReplies: 5, lastInboxVisitAt: t,
    watcherStartedAt: null, lastMatchScanAt: null, matchPhase: null, watcherSafe: false, now: t
  }), "inbox");
  assert.equal(nextSingleTabRotation({
    owner: "swipe", pendingReplies: 0, lastInboxVisitAt: t,
    watcherStartedAt: null, lastMatchScanAt: null, matchPhase: null, watcherSafe: true, now: t + INBOX_SCAN_INTERVAL_MS
  }), "inbox", "Even zero DB backlog must periodically inspect Tinder itself");
  const base = {
    owner: "watcher", pendingReplies: 0, lastInboxVisitAt: t,
    watcherStartedAt: t, lastMatchScanAt: new Date(t + 10_000).toISOString(),
    matchPhase: "idle", watcherSafe: true, now: t + INBOX_MIN_DWELL_MS
  };
  assert.equal(nextSingleTabRotation(base), "swipe");
  assert.equal(nextSingleTabRotation({ ...base, pendingReplies: null }), "wait");
  assert.equal(nextSingleTabRotation({ ...base, pendingReplies: 1 }), "wait");
  assert.equal(nextSingleTabRotation({ ...base, matchPhase: "opener" }), "wait");
  assert.equal(nextSingleTabRotation({ ...base, watcherSafe: false }), "wait");
  assert.equal(nextSingleTabRotation({ ...base, lastMatchScanAt: new Date(t - 1).toISOString() }), "wait");
});

test("automatic Chat ignores periodically requeued old messages after they were reviewed", () => {
  const t = Date.parse(at);
  let index = reconcileExistingIndex(null, "owner", [
    { ref: "incoming", lastMessageAt: at, lastMessageDirection: "incoming" },
    { ref: "answered", lastMessageAt: at, lastMessageDirection: "outgoing" }
  ], at);
  assert.equal(nextImmediateWatchedReply(index), "incoming");
  index = markThreadChecked(index, "incoming", new Date(t + 10_000).toISOString());
  index = reconcileExistingIndex(index, "owner", [
    { ref: "incoming", lastMessageAt: at, lastMessageDirection: "incoming" },
    { ref: "answered", lastMessageAt: at, lastMessageDirection: "outgoing" }
  ], new Date(t + 4 * 60_000).toISOString());
  assert.equal(pendingImmediateWatcherReplies(index), 0,
    "An unchanged incoming DB version was already checked, even when the maintenance queue reopens it");
  assert.equal(nextImmediateWatchedReply(index), null);
  assert.equal(nextWatchedReply(index), "incoming",
    "The legacy/maintenance watcher may still recheck the thread");
  index = reconcileExistingIndex(index, "owner", [
    { ref: "incoming", lastMessageAt: new Date(t + 5 * 60_000).toISOString(), lastMessageDirection: "incoming" },
    { ref: "answered", lastMessageAt: at, lastMessageDirection: "outgoing" }
  ], new Date(t + 5 * 60_000).toISOString());
  assert.equal(nextImmediateWatchedReply(index), "incoming",
    "A genuinely new persisted incoming message immediately takes priority");
});

test("automatic rotation returns to Swipe as soon as the verified Matches scan finishes", () => {
  const t = Date.parse(at);
  assert.equal(INBOX_SCAN_INTERVAL_MS, 60_000, "While swiping, revisit inbox about once a minute");
  assert.equal(INBOX_MIN_DWELL_MS, 0, "Do not wait for a match to answer after sending");
  const state = {owner: "watcher", pendingReplies: 0, lastInboxVisitAt: t,
    watcherStartedAt: t, lastMatchScanAt: new Date(t + 17_000).toISOString(),
    matchPhase: "idle", watcherSafe: true, now: t + 18_000};
  assert.equal(nextSingleTabRotation(state), "swipe");
  assert.equal(nextSingleTabRotation({...state, matchPhase:"verifying"}), "wait");
  assert.equal(nextSingleTabRotation({...state, pendingReplies:1}), "wait");
  assert.equal(nextSingleTabRotation({...state, watcherSafe:false}), "wait");
});

test("a confirmed Tinder Send clears focus and wakes the watcher instead of waiting for another reply", async () => {
  const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts", import.meta.url),"utf8");
  const event = runner.slice(runner.indexOf("async function contentEvent("),
    runner.indexOf("chrome.alarms.onAlarm.addListener(",runner.indexOf("async function contentEvent(")));
  assert.match(event,/phase === "sent" \|\| phase === "skipped"\s*\? \{ \.\.\.recordedActivity, activeConversationRef: null, activeConversationUntil: null \}/);
  assert.match(event,/if \(completedVisit\) void tick\(\)/);
  assert.match(runner,/pendingImmediateWatcherReplies\(queued\)/);
  assert.match(runner,/nextImmediateWatchedReply\(queued\)/);
  assert.match(runner,/return pendingImmediateWatcherReplies\(pending\)/);
});

test("the Tinder inventory is read-only, with original authorization and unique-tab gates retained", async () => {
  const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
  const [content, runner, coordinator, background] = await Promise.all([
    "src/content.ts", "src/tinder-global-existing-runner.ts",
    "src/unified-controller-background.ts", "src/background.ts"
  ].map(read));
  assert.match(content, /TNND_WATCHER_READ_MESSAGES/);
  assert.match(content, /visibleTinderMessageThreadRefs\(\)/);
  assert.match(runner, /observeTinderInbox\(queued/);
  assert.match(runner, /startExistingRunnerUnlocked/);
  assert.match(coordinator, /navigateOneTab\(master\.tabId/);
  assert.match(coordinator, /safeSwipeHandoff\(session, parsed\.settings\)/);
  assert.match(background, /mayAutomaticallySendToTinder\(backend\)/);
  assert.doesNotMatch(coordinator, /chrome\.tabs\.create\(/);
  assert.match(coordinator, /TNND_WATCHER_SELECT_SIDEBAR/,
    "Messages navigation must use Tinder's own confirmed sidebar switch");
  assert.match(coordinator, /TNND_WATCHER_READ_MESSAGES/,
    "Only the actual rendered Tinder sidebar is a verified inbox");
  assert.doesNotMatch(coordinator, /navigateOneTab\([^\n]*"\/app\/messages"\)/,
    "Never hard-navigate to the 404 bare Messages route");
  assert.match(coordinator, /tinder_messages_sidebar_unavailable/,
    "A missing Tinder Messages UI must fail closed, not guess a URL");
  assert.doesNotMatch(runner, /chrome\.tabs\.create\(\{\s*url: "https:\/\/tinder\.com\/app\/messages"/,
    "Existing runner must not create an extra broken Tinder tab");
});
