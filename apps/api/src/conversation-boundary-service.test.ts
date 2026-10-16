import assert from "node:assert/strict";
import test from "node:test";
import { classifyConversationBoundary } from "../../../src/conversation-boundary-policy.js";
import { desiredBoundaryTransition, validateObservedConversationBoundary } from "./conversation-boundary-service.js";

test("normal farewells do not disable a chat on their own", () => {
  const input = validateObservedConversationBoundary({
    externalThreadId: "thread-1",
    messages: [{ direction: "outgoing", text: "Ca va ?" }, { direction: "incoming", text: "Bonne soirée" }]
  });
  assert.equal(classifyConversationBoundary(input.messages).kind, "continue");
  assert.equal(desiredBoundaryTransition(classifyConversationBoundary(input.messages)), null);
});
test("a mutual end pauses the chat without disabling future incoming replies", () => {
  const input = validateObservedConversationBoundary({
    externalThreadId: "thread-2",
    messages: [{ direction: "outgoing", text: "Bonne nuit !" }, { direction: "incoming", text: "Bye :)" }]
  });
  assert.deepEqual(desiredBoundaryTransition(classifyConversationBoundary(input.messages)), {
    status: "waiting-for-them", managementState: "ai-managed"
  });
});
test("explicit handoff disables Tinder AI management without sending off-app", () => {
  const input = validateObservedConversationBoundary({
    externalThreadId: "thread-3",
    messages: [{ direction: "outgoing", text: "Let's talk on WhatsApp" }, { direction: "incoming", text: "Okay" }]
  });
  assert.deepEqual(desiredBoundaryTransition(classifyConversationBoundary(input.messages)), {
    status: "moved-off-tinder", managementState: "moved-off-tinder"
  });
});
test("clear do-not-contact instruction disables AI automation", () => {
  const messages = [{ direction: "incoming" as const, text: "Don't message me again" }];
  assert.deepEqual(desiredBoundaryTransition(classifyConversationBoundary(messages)), {
    status: "disabled", managementState: "unmanaged"
  });
});
test("rejects arbitrary status, oversized history, outgoing-only and unsupported directions", () => {
  const baseline = { externalThreadId: "thread-4", messages: [{ direction: "incoming", text: "Bye" }] };
  assert.throws(() => validateObservedConversationBoundary({ ...baseline, messages: [] }), /invalid_conversation_boundary/);
  assert.throws(() => validateObservedConversationBoundary({ ...baseline, messages: [{ direction:"outgoing", text:"Bye" }] }), /invalid_conversation_boundary/);
  assert.throws(() => validateObservedConversationBoundary({ ...baseline, messages: [{ direction:"unknown", text:"Bye" }] }), /invalid_conversation_boundary/);
  assert.throws(() => validateObservedConversationBoundary({ ...baseline, messages: Array(13).fill(baseline.messages[0]) }), /invalid_conversation_boundary/);
  assert.throws(() => validateObservedConversationBoundary({ ...baseline, externalThreadId: "a".repeat(513) }), /invalid_conversation_boundary/);
});
