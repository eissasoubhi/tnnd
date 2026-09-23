import assert from "node:assert/strict";
import test from "node:test";
import { parseTextingStyleAnalysis } from "./texting-style-gemini-provider.js";

const valid = {
  formality: "casual", capitalization: "lowercase", punctuationDensity: "low", emojiFrequency: "low",
  abbreviationFrequency: "high", slangLevel: "medium", messageLength: "short", sentenceStyle: "fragments",
  grammarStyle: "casual", questionFrequency: "medium", teasingStyle: "light", humorStyle: "playful",
  directness: "balanced", doubleTexting: "sometimes", languageNotes: { fr: "casual", darija: "mixed", en: "brief" }
};

test("parses a complete structured texting style", () => {
  assert.deepEqual(parseTextingStyleAnalysis(JSON.stringify(valid)), valid);
});

test("rejects enum values outside the contract", () => {
  assert.throws(() => parseTextingStyleAnalysis(JSON.stringify({ ...valid, emojiFrequency: "always" })), /invalid_texting_style_response/);
});

test("rejects incomplete language notes", () => {
  assert.throws(() => parseTextingStyleAnalysis(JSON.stringify({ ...valid, languageNotes: { fr: "casual", en: "brief" } })), /invalid_texting_style_response/);
});
