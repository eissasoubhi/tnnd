import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TEXTING_STYLE_EXAMPLE_LENGTH,
  MAX_TEXTING_STYLE_EXAMPLES,
  parsePastedTextingStyleExamples,
  prepareTextingStyleExamples
} from "./texting-style-examples";

test("parses pasted examples separated by blank lines", () => {
  assert.deepEqual(
    parsePastedTextingStyleExamples("  hey ça va  \n\nmdr oui\nça marche\n\n  see you later  "),
    ["hey ça va", "mdr oui\nça marche", "see you later"]
  );
});

test("drops empty examples and keeps raw source retention opt-in explicit", () => {
  assert.deepEqual(prepareTextingStyleExamples([" ", " salut "]), {
    examples: ["salut"],
    sourceRetentionOptIn: false
  });
  assert.equal(prepareTextingStyleExamples(["salut"], true).sourceRetentionOptIn, true);
});

test("bounds example count and individual example length", () => {
  const oversized = "x".repeat(MAX_TEXTING_STYLE_EXAMPLE_LENGTH + 20);
  const input = Array.from({ length: MAX_TEXTING_STYLE_EXAMPLES + 5 }, (_, index) => `${index}-${oversized}`);
  const prepared = prepareTextingStyleExamples(input);

  assert.equal(prepared.examples.length, MAX_TEXTING_STYLE_EXAMPLES);
  assert.ok(prepared.examples.every((example) => example.length <= MAX_TEXTING_STYLE_EXAMPLE_LENGTH));
});
