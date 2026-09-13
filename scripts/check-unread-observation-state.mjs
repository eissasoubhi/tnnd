import assert from "node:assert/strict";
import {
  markUnreadObservationCompleted,
  pendingUnreadConversationRefs,
  reconcileUnreadObservations
} from "../src/tinder-unread-observation-state.ts";

const first = reconcileUnreadObservations(null, [
  { conversationRef: "thread-a", signal: "aria" },
  { conversationRef: "thread-b", signal: "badge" },
  { conversationRef: "thread-a", signal: "class" }
], "2026-09-13T06:00:00.000Z");

assert.deepEqual(pendingUnreadConversationRefs(first), ["thread-a", "thread-b"]);
assert.equal(first.entries.length, 2);

const completed = markUnreadObservationCompleted(first, "thread-a", "2026-09-13T06:01:00.000Z");
assert.deepEqual(pendingUnreadConversationRefs(completed), ["thread-b"]);

const stillVisible = reconcileUnreadObservations(completed, [
  { conversationRef: "thread-a", signal: "aria" },
  { conversationRef: "thread-b", signal: "badge" }
], "2026-09-13T06:02:00.000Z");
assert.deepEqual(pendingUnreadConversationRefs(stillVisible), ["thread-b"]);

const disappeared = reconcileUnreadObservations(stillVisible, [
  { conversationRef: "thread-b", signal: "badge" }
], "2026-09-13T06:03:00.000Z");
assert.equal(disappeared.entries.some((entry) => entry.conversationRef === "thread-a"), false);

const reappeared = reconcileUnreadObservations(disappeared, [
  { conversationRef: "thread-a", signal: "aria" },
  { conversationRef: "thread-b", signal: "badge" }
], "2026-09-13T06:04:00.000Z");
assert.deepEqual(pendingUnreadConversationRefs(reappeared), ["thread-a", "thread-b"]);

console.log("Unread observation reconciliation passed.");
