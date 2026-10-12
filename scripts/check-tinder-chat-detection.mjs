import assert from "node:assert/strict";
import { detectTinderChat, findLegacyChatSettingsKey } from "../src/tinder-chat-detection.ts";

const conversation = "/app/messages/test-thread-42";
assert.deepEqual(detectTinderChat(conversation, true), {
  threadKey: conversation, composerFound: true, source: "route-and-composer"
});
assert.deepEqual(detectTinderChat(conversation, false), {
  threadKey: conversation, composerFound: false, source: "route-only"
});
assert.equal(detectTinderChat("/app/messages", true).threadKey, null);
assert.equal(detectTinderChat("/app/recs", true).threadKey, null);
assert.equal(detectTinderChat("/app/matches", false).threadKey, null);
assert.equal(detectTinderChat("/app/messages/", false).threadKey, null);
assert.equal(detectTinderChat("/app/messages/test-thread-42/", false).threadKey, conversation);
assert.equal(
  findLegacyChatSettingsKey([conversation + "|Tinder", "/app/messages/other|Tinder"], conversation),
  conversation + "|Tinder"
);
assert.equal(findLegacyChatSettingsKey(["/app/messages/other|Tinder"], conversation), null);
console.log("Tinder chat route detection and legacy thread-key compatibility passed.");
