import assert from "node:assert/strict";
import {
  conversationStatusAllowsTinderAutomation,
  describeConversationAutomationPause,
  getConversationAutomationDisposition,
  reconcileAutomationPauseMessage
} from "../src/tinder-conversation-automation-status.ts";

assert.equal(conversationStatusAllowsTinderAutomation("action-required"), false);
assert.equal(conversationStatusAllowsTinderAutomation("waiting-for-user"), false);
assert.equal(conversationStatusAllowsTinderAutomation("active"), true);
assert.equal(conversationStatusAllowsTinderAutomation("waiting-for-them"), true);

assert.deepEqual(getConversationAutomationDisposition("action-required"), {
  allowed: false,
  status: "action-required",
  reason: "human-action",
  message: "Human action required · Tinder automation paused until the action is resolved in TNND."
});
assert.equal(getConversationAutomationDisposition("waiting-for-user").reason, "waiting-for-user");
assert.equal(getConversationAutomationDisposition("paused").reason, "server-paused");
assert.equal(getConversationAutomationDisposition("disabled").reason, "server-disabled");
assert.equal(getConversationAutomationDisposition("moved-off-tinder").reason, "moved-off-tinder");
assert.equal(getConversationAutomationDisposition("active").reason, null);

const pausedMessage = describeConversationAutomationPause("action-required");
assert.match(pausedMessage ?? "", /^Human action required ·/);
assert.equal(reconcileAutomationPauseMessage(pausedMessage, "active"), null);
assert.match(reconcileAutomationPauseMessage(pausedMessage, "waiting-for-user") ?? "", /^Waiting for you ·/);
assert.equal(reconcileAutomationPauseMessage("Waiting for you · pending input", "active"), null);
assert.equal(
  reconcileAutomationPauseMessage("Sync failed (503).", "active"),
  "Sync failed (503)."
);
assert.match(
  reconcileAutomationPauseMessage(null, "paused") ?? "",
  /^Conversation automation paused by server status: paused\.$/
);

console.log("Human-action resume regression checks passed.");
