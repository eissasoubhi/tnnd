import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(resolve(root,"conversation-panel.ts"),"utf8");
const draft = readFileSync(resolve(root,"conversation-overrides-panel.ts"),"utf8");
const client = readFileSync(resolve(root,"conversation-client.ts"),"utf8");
test("draft generation asks the authenticated backend for latest imported message, with no required typing", () => {
 assert.doesNotMatch(draft,/Latest message required/);
 assert.match(draft,/Generate a reply from synced chat/);
 assert.match(draft,/const latestMessage = generationMessage.value.trim\(\)/);
 assert.doesNotMatch(draft,/await getConversation\(session, conversationId\)/);
 assert.match(draft,/Advanced · Test another message manually \(optional\)/);
});
test("unknown Tinder profiles show a neutral avatar and optional user-saved name/age", () => {
 assert.match(panel,/conversation-display-name/);
 assert.match(panel,/conversation-display-age/);
 assert.match(panel,/saveConversationDisplayIdentity/);
 assert.match(client,/\/identity/);
 assert.doesNotMatch(panel,/displayName.startsWith\("Conversation "\) \? "\?"/);
});

test("conversation flow appears on detail cards without creating a send action or exposing private text", () => {
  assert.match(panel,/renderConversationFlow\(detail\)/);
  assert.match(panel,/aria-label="Conversation Flow"/);
  assert.match(panel,/Les réponses du match passent toujours en priorité/);
  assert.match(client,/normalizeConversationFlow\(input\.conversationFlow\)/);
});
