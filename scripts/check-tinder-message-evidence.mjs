import assert from "node:assert/strict";
import test from "node:test";
import { directionFromTinderHints, visibleTranscriptSummary } from "../src/tinder-message-evidence.ts";

test("generic Sent at/sender labels are NOT proof of an outgoing message", () => {
  assert.equal(directionFromTinderHints(["Sent at 12:02 AM", "sender"]), "unknown");
  assert.equal(directionFromTinderHints(["message-date", "Sent at 20:30"]), "unknown");
  assert.equal(directionFromTinderHints(["from-match", "Sent at 12:02"]), "them");
});
test("respects explicit reliable direction tokens", () => {
  assert.equal(directionFromTinderHints(["chat-bubble-send"]), "me");
  assert.equal(directionFromTinderHints(["message-outgoing"]), "me");
  assert.equal(directionFromTinderHints(["incoming"]), "them");
  assert.equal(directionFromTinderHints(["msg--received"]), "them");
});
test("ambiguous mixed direction hints must fall back to geometry instead of inventing a sender", () => {
  assert.equal(directionFromTinderHints(["incoming", "outgoing"]), "unknown");
  assert.equal(directionFromTinderHints([]), "unknown");
});
test("import reports how many incoming and outgoing Tinder messages were recognized", () => {
  assert.deepEqual(visibleTranscriptSummary([
    {direction:"them",text:"Hello"}, {direction:"me",text:"Hi"}, {direction:"them",text:"How are you?"}
  ]), {received:2,sent:1,last:"them"});
  assert.deepEqual(visibleTranscriptSummary([{direction:"me",text:"Hello"}]), {received:0,sent:1,last:"me"});
});
