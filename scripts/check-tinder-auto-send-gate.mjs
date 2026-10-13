import assert from "node:assert/strict";
import test from "node:test";
import { mayAutomaticallySendToTinder } from "../src/tinder-auto-send-gate.ts";
const build = (state, status, selected=true) => ({
  conversationId: "recorded-chat",
  conversationStatus: status,
  management: {state, explicitlySelected:selected},
  syncCursor: "cursor", syncCursorUpdatedAt: null
});
test("Tinder auto send is disabled unless AI management was explicitly granted and backend status allows it", () => {
  assert.equal(mayAutomaticallySendToTinder(null), false);
  assert.equal(mayAutomaticallySendToTinder(build("unmanaged","active")), false);
  assert.equal(mayAutomaticallySendToTinder(build("manual","active")), false);
  assert.equal(mayAutomaticallySendToTinder(build("ai-managed","paused")), false);
  assert.equal(mayAutomaticallySendToTinder(build("ai-managed","disabled")), false);
  assert.equal(mayAutomaticallySendToTinder(build("ai-managed","action-required")), false);
  assert.equal(mayAutomaticallySendToTinder(build("ai-managed","waiting-for-user")), false);
  assert.equal(mayAutomaticallySendToTinder(build("ai-managed","active",false)), false);
  assert.equal(mayAutomaticallySendToTinder({...build("ai-managed","active"),conversationId:null}), false);
  assert.equal(mayAutomaticallySendToTinder(build("ai-managed","active")), true);
  assert.equal(mayAutomaticallySendToTinder(build("ai-managed","waiting-for-them")), true);
});
