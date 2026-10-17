import assert from "node:assert/strict";
import test from "node:test";
import { knownHandoffPlatform, normalizeConversationListItem } from "./conversation-contract";

function item(overrides: Record<string, unknown>) {
  return normalizeConversationListItem({
    id: "chat-1", displayName: "A verified match", status: "moved-off-tinder",
    pendingHumanActions: 0, ...overrides
  });
}
test("only known handoff platforms can be displayed", () => {
  assert.equal(knownHandoffPlatform("instagram"), "instagram");
  assert.equal(knownHandoffPlatform("whatsapp"), "whatsapp");
  assert.equal(knownHandoffPlatform("<script>"), null);
  assert.equal(knownHandoffPlatform(""), null);
  assert.equal(knownHandoffPlatform(null), null);
});
test("unknown and manually marked handoffs are not misrepresented as confirmed", () => {
  assert.equal(item({ handoffPlatform: "whatsapp" }).handoffPlatform, "whatsapp");
  assert.equal(item({ handoffPlatform: null }).handoffPlatform, null);
  assert.equal(item({ handoffPlatform: "<script>" }).handoffPlatform, null);
  assert.equal(item({ status: "active", handoffPlatform: "instagram" }).handoffPlatform, null);
});
