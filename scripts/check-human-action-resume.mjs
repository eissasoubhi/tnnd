import assert from "node:assert/strict";
import {
  conversationStatusAllowsTinderAutomation,
  describeConversationAutomationPause,
  reconcileAutomationPauseMessage
} from "../src/tinder-conversation-automation-status.ts";

assert.equal(conversationStatusAllowsTinderAutomation("action-required"), false);
assert.equal(conversationStatusAllowsTinderAutomation("active"), true);
assert.equal(conversationStatusAllowsTinderAutomation("waiting-for-them"), true);

const pausedMessage = describeConversationAutomationPause("action-required");
assert.match(pausedMessage ?? "", /^Human action required ·/);
assert.equal(reconcileAutomationPauseMessage(pausedMessage, "active"), null);
assert.equal(reconcileAutomationPauseMessage(pausedMessage, "waiting-for-user"), null);
assert.equal(
  reconcileAutomationPauseMessage("Sync failed (503).", "active"),
  "Sync failed (503)."
);
assert.match(
  reconcileAutomationPauseMessage(null, "paused") ?? "",
  /^Conversation automation paused by server status: paused\.$/
);

console.log("Human-action resume regression checks passed.");
