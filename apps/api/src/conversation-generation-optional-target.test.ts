import assert from "node:assert/strict";
import test from "node:test";
import { validateConversationGenerationRequest } from "./conversation-generation-controller.js";
import { generationErrorResponse } from "./conversation-generation-error-response.js";

test("generation without a manual last-message field is supported", () => {
  assert.deepEqual(validateConversationGenerationRequest({}), {});
  assert.deepEqual(validateConversationGenerationRequest({ latestMessage: " " }), {});
  assert.deepEqual(validateConversationGenerationRequest({ previewInstruction: "shorter" }), {
    previewInstruction: "shorter"
  });
});
test("explicit manual preview targets remain validated", () => {
  assert.deepEqual(validateConversationGenerationRequest({ latestMessage: " Salut " }), {
    latestMessage: "Salut"
  });
  assert.throws(() => validateConversationGenerationRequest({ latestMessage: 10 }), /latest_message_must_be_string/);
  assert.throws(() => validateConversationGenerationRequest({ latestMessage: "a".repeat(4001) }), /latest_message_too_long/);
});
test("no incoming synced messages has actionable, non-500 status", () => {
  assert.deepEqual(generationErrorResponse(new Error("no_synced_incoming_message")), {
    status: 409, body: { error: "no_synced_incoming_message" }
  });
});
