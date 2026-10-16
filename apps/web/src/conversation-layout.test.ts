import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const directory = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(directory, "neo-bento.css"), "utf8");
const conversation = readFileSync(resolve(directory, "conversation-panel.ts"), "utf8");

test("conversation columns have distinct, labelled scroll regions", () => {
  assert.match(conversation, /class="conversation-column" aria-labelledby="conversation-list-heading"/);
  assert.match(conversation, /class="conversation-column" aria-labelledby="conversation-detail-heading"/);
  assert.match(conversation, /id="conversation-list" class="conversation-list" role="region" aria-labelledby="conversation-list-heading" tabindex="0"/);
  assert.match(conversation, /id="conversation-detail" class="conversation-detail" role="region" aria-labelledby="conversation-detail-heading" tabindex="0"/);
  assert.doesNotMatch(conversation, /max-height:430px/);
});

test("Neo Bento balances the two conversation panes and gives each its own scrolling", () => {
  assert.match(css, /#app \.conversation-layout \{[\s\S]*?block-size: clamp\(460px, 68vh, 780px\)/);
  assert.match(css, /#app \.conversation-column \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/);
  assert.match(css, /#app \.conversation-list,\s*#app \.conversation-detail \{[\s\S]*?overflow-y: auto;/);
  assert.match(css, /#app \.conversation-detail \.conversation-messages \{\s*max-height: none;\s*overflow: visible;/);
  assert.match(css, /#app \.conversation-list:focus-visible,/);
});

test("narrow web view stacks columns and removes nested scrolling from details", () => {
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?#app \.conversation-layout \{\s*grid-template-columns: minmax\(0, 1fr\);\s*block-size: auto;/);
  assert.match(css, /#app \.conversation-detail \{\s*flex: 0 1 auto;\s*overflow: visible;/);
});

test("switching conversations resets detail scroll and preserves row keyboard focus", () => {
  assert.match(conversation, /if \(changedChat\) elements\?\.detail\.scrollTo\(\{ top: 0 \}\)/);
  assert.match(conversation, /\.focus\(\{ preventScroll: true \}\)/);
});
