import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "conversation-panel.ts"), "utf8");
test("conversation list gives a clear reset for search/status filters", () => {
  assert.match(source, /id="conversation-clear-filters"/);
  assert.match(source, /hasConversationFilters\(elements\.search\.value, elements\.filter\.value\)/);
  assert.match(source, /conversationEmptyState\(total, filtered\)/);
  assert.match(source, /clearFilters\.addEventListener\("click"/);
});
test("switching accounts invalidates old async list and detail results", () => {
  assert.match(source, /let refreshRequestSequence = 0/);
  assert.match(source, /displayedSessionToken/);
  assert.match(source, /isCurrentConversationResponse\(requestId, refreshRequestSequence, session\.token, readSession\(\)\?\.token\)/);
  assert.match(source, /isCurrentConversationResponse\(requestId, detailRequestSequence, session\.token, readSession\(\)\?\.token\)/);
  assert.match(source, /Conversation details are unavailable until the list loads successfully/);
  assert.doesNotMatch(source, /"0 shown · 0 total"/);
});


test("semantic stage and tone are optional, labeled as estimates and clear with other filters", () => {
  assert.match(source, /id="conversation-semantic-stage"/);
  assert.match(source, /id="conversation-semantic-tone"/);
  assert.match(source, /estimated from saved messages/);
  assert.match(source, /semanticStage: elements.semanticStage.value/);
  assert.match(source, /semanticTone: elements.semanticTone.value/);
  assert.match(source, /elements.semanticStage.value = "all"/);
  assert.match(source, /elements.semanticTone.value = "all"/);
});
