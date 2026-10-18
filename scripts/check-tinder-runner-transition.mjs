import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertSwipeNotArmed, withTinderRunnerTransition } from "../src/tinder-runner-transition.ts";

const events = [];
let releaseFirst;
const first = withTinderRunnerTransition(async () => {
  events.push("first-start");
  await new Promise(resolve => { releaseFirst = resolve; });
  events.push("first-end");
  throw new Error("first_failed");
});
const second = withTinderRunnerTransition(async () => { events.push("second"); });
await Promise.resolve();
assert.deepEqual(events, ["first-start"]);
releaseFirst();
await assert.rejects(first, /first_failed/);
await second;
assert.deepEqual(events, ["first-start", "first-end", "second"]);

globalThis.chrome = { storage: { local: { get: async () => ({
  "tnnd.smartSwipeLiveArm.v1:other-account": { armed: true }
}) } } };
await assert.rejects(assertSwipeNotArmed(), /Stop Smart Swipe/);
globalThis.chrome.storage.local.get = async () => ({
  "tnnd.smartSwipeLiveArm.v1:other-account": { armed: false }
});
await assertSwipeNotArmed();

const existing = readFileSync(new URL("../src/tinder-global-existing-runner.ts", import.meta.url), "utf8");
const match = readFileSync(new URL("../src/tinder-new-match-background.ts", import.meta.url), "utf8");
const swipe = readFileSync(new URL("../src/tinder-smart-swipe-automation-background.ts", import.meta.url), "utf8");
assert.ok(existing.includes("withTinderRunnerTransition(() => startExistingRunnerUnlocked("));
assert.ok(match.includes("serialized(() => withTinderRunnerTransition(async () => {"));
assert.ok(swipe.includes("withTinderRunnerTransition(async () => {"));
assert.ok(swipe.includes("return setArmed(armed, expectedStopEpoch);"));
assert.ok(swipe.includes("if (!armed) stopRequested = true;"),
  "Stop must preempt running jobs before waiting for the transition queue");
assert.ok(swipe.includes("await chrome.storage.local.set({ ...disabled, [STORAGE_STOP]: true });"),
  "Stop must persist both disarm and the durable safety latch");
assert.ok(swipe.includes("if (await stopIsRequested()) return;"),
  "tick must fail closed when the durable Stop latch remains set");
assert.ok(swipe.includes("if (expectedStopEpoch !== stopEpoch)"),
  "an earlier queued Start must never supersede a later Stop");
console.log("Tinder runner Start/Stop transitions are serialized.");
