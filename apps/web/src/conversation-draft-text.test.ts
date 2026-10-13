import assert from "node:assert/strict";
import test from "node:test";
import { cleanDraftText } from "./conversation-draft-text";
import { draftFailureGuidance } from "./draft-failure-guidance";
test("plain chat drafts are unchanged", () => { assert.equal(cleanDraftText("Salut !"), "Salut !"); });
test("valid structured output shows only its text", () => { assert.equal(cleanDraftText(JSON.stringify({text:"Hello !"})), "Hello !"); });
test("incomplete and malformed Gemini output is refused", () => {
  for (const value of [JSON.stringify({text:""}), "{\"text\":", "{\"text\":\"Bonjour", ""]) {
    assert.throws(() => cleanDraftText(value), /gemini_invalid_output/);
  }
});
test("clear error guidance for invalid and truncated Gemini drafts", () => {
 assert.match(draftFailureGuidance("gemini_output_truncated"), /stopped before completing/);
 assert.match(draftFailureGuidance("gemini_invalid_output"), /incomplete or malformed/);
});
