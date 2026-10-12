import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAvoidedTopic, nextAvoidedTopics } from "./topic-preference-service.js";
test("canonicalizes topics, avoids duplicates, allows restoring", () => {
  assert.equal(normalizeAvoidedTopic(" SPORTS "), "sports");
  assert.deepEqual(nextAvoidedTopics(["sports"], "sports", true), ["sports"]);
  assert.deepEqual(nextAvoidedTopics(["travel", "sports"], "sports", false), ["travel"]);
  assert.deepEqual(nextAvoidedTopics([], "topic:photography", true), ["topic:photography"]);
});
test("rejects unsupported identifiers and unsafe payloads", () => {
  assert.throws(() => normalizeAvoidedTopic("a"), /invalid_topic/);
  assert.throws(() => normalizeAvoidedTopic("topic:<script>"), /invalid_topic/);
  assert.throws(() => normalizeAvoidedTopic({ id: "sports" }), /invalid_topic/);
});
