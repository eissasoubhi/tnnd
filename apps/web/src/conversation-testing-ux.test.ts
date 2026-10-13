import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(resolve(root,"conversation-panel.ts"),"utf8");
const draft = readFileSync(resolve(root,"conversation-overrides-panel.ts"),"utf8");
const client = readFileSync(resolve(root,"conversation-client.ts"),"utf8");
test("draft generation refreshes the latest imported match message rather than requiring retyping", () => {
 assert.doesNotMatch(draft,/Latest message required/);
 assert.match(draft,/await getConversation\(session, conversationId\)/);
 assert.match(draft,/replyTargetFromHistory\(detailSnapshot.messages\)/);
 assert.match(draft,/generationMessage.value = latestMessage/);
});
test("unknown Tinder profiles show a neutral avatar and optional user-saved name/age", () => {
 assert.match(panel,/conversation-display-name/);
 assert.match(panel,/conversation-display-age/);
 assert.match(panel,/saveConversationDisplayIdentity/);
 assert.match(client,/\/identity/);
 assert.doesNotMatch(panel,/displayName.startsWith\("Conversation "\) \? "\?"/);
});
