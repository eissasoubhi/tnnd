import assert from "node:assert/strict";
import test from "node:test";
import { classifyConversationBoundary } from "../../../src/conversation-boundary-policy.js";
import { desiredBoundaryTransition, handoffProvenance, validateObservedConversationBoundary, verifiedConversationBoundary } from "./conversation-boundary-service.js";

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
    messages: [{ direction: "outgoing", text: "Bonne nuit !" }, { direction: "incoming", text: "Bye 🙂" }]
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


test("forged goodbye or handoff observations cannot alter stored history", () => {
  const stored = [
    { direction: "outgoing" as const, text: "On se voit demain ?" },
    { direction: "incoming" as const, text: "Je sais pas encore." }
  ];
  const forged = [
    { direction: "outgoing" as const, text: "On passe sur Insta ?" },
    { direction: "incoming" as const, text: "OK" }
  ];
  assert.deepEqual(verifiedConversationBoundary(forged, stored), { kind: "continue", platform: null });
  assert.deepEqual(verifiedConversationBoundary([
    { direction: "incoming", text: "Ne m'écris plus" }
  ], stored), { kind: "continue", platform: null });
});
test("stored transcript independently confirms a mutual farewell", () => {
  const stored = [
    { direction: "outgoing" as const, text: "Bonne nuit !" },
    { direction: "incoming" as const, text: "Bye 🙂" }
  ];
  assert.equal(verifiedConversationBoundary(stored, stored).kind, "rest");
  assert.equal(verifiedConversationBoundary(stored.slice(-1), stored).kind, "continue");
});
test("server rejects a stale observation when a newer message is already saved", () => {
  const observed = [
    { direction: "outgoing" as const, text: "Bonne soirée" },
    { direction: "incoming" as const, text: "Bye 🙂" }
  ];
  const persisted = [...observed, { direction: "incoming" as const, text: "Salut, tu fais quoi ?" }];
  assert.deepEqual(verifiedConversationBoundary(observed, persisted), { kind: "continue", platform: null });
});
test("direct no-contact and off-app requests require matching latest persisted evidence", () => {
  const stop = [{ direction: "incoming" as const, text: "Don't message me again" }];
  assert.equal(verifiedConversationBoundary(stop, stop).kind, "do-not-contact");
  const move = [{ direction: "incoming" as const, text: "Écris-moi sur Instagram plutôt" }];
  assert.equal(verifiedConversationBoundary(move, move).kind, "off-tinder");
  assert.equal(verifiedConversationBoundary(move, stop).kind, "continue");
});


test("persisted platform provenance requires verified incoming source ID, never outgoing guesses", () => {
  const boundary = { kind: "off-tinder" as const, platform: "instagram" as const };
  assert.deepEqual(handoffProvenance(boundary, { direction: "incoming", external_message_id: "synced-inbound-id" }), {
    platform: "instagram", sourceExternalMessageId: "synced-inbound-id"
  });
  assert.equal(handoffProvenance(boundary, { direction: "outgoing", external_message_id: "synced-outbound-id" }), null);
  assert.equal(handoffProvenance(boundary, { direction: "incoming", external_message_id: "" }), null);
  assert.equal(handoffProvenance({ kind: "continue", platform: null }, { direction: "incoming", external_message_id: "id" }), null);
  assert.equal(handoffProvenance({ kind: "rest", platform: null }, { direction: "incoming", external_message_id: "id" }), null);
});
