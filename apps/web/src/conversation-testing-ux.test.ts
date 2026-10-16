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
  assert.match(panel,/What the match says always takes priority/);
  assert.match(client,/normalizeConversationFlow\(input\.conversationFlow\)/);
});

test("conversation flow remains visible with actionable diagnostics on old API", () => {
 assert.match(panel,/if \(!flow\) \{/);
 assert.match(panel,/aria-label="Conversation Flow"/);
 assert.match(panel,/version 0\.2\.18 or later/);
 assert.match(panel,/Refresh this page/);
 assert.match(panel,/Unavailable/);
 assert.match(panel,/renderConversationFlow\(detail\)/);
});


test("conversation identity and temporary-instruction labels are clear and accessible", () => {
  const management = readFileSync(resolve(root, "conversation-management-panel.ts"), "utf8");
  assert.match(panel, /Match name not yet synced/);
  assert.match(management, /Match name not yet synced/);
  assert.doesNotMatch(panel, /Profil Tinder à synchroniser/);
  assert.ok(panel.includes('<label class="temporary-instruction-label" for="conversation-temporary-instruction">Instruction for this conversation</label>'));
  assert.match(panel, /aria-describedby="conversation-temporary-instruction-help"/);
  assert.match(panel, /data-temporary-instruction-status role="status" aria-live="polite"/);
  assert.match(panel, /Based on synchronized conversation history/);
  assert.doesNotMatch(panel, /Live structured conversation context/);
});

test("conversation detail prioritizes draft and messages before collapsible advanced context", () => {
  const detail = panel.slice(panel.indexOf("function renderDetail("), panel.indexOf("function countStatus("));
  const historyAt = detail.indexOf('class="conversation-messages"');
  const temporaryAt = detail.indexOf("renderTemporaryInstruction(detail)");
  const topicAt = detail.indexOf("renderTopicState(detail)");
  assert.ok(historyAt > 0 && temporaryAt > historyAt && topicAt > temporaryAt);
  assert.match(detail, /<summary>Conversation topics and progress/);
  assert.match(detail, /<summary>Temporary instruction/);
  assert.match(detail, /detail\.temporaryInstruction \? " open" : ""/);
  assert.match(detail, /aria-label="Saved conversation history"/);
  assert.match(draft, /detail\.insertBefore\(section, messages\)/);
});

test("conversations default to newest first and provide optional reply urgency sort",()=>{
 assert.match(panel,/option value="recent">Newest first/);
 assert.match(panel,/option value="waiting">Needs reply first/);
 assert.match(panel,/sort: elements.sort.value as ConversationSort/);
 assert.match(panel,/lastMessageDirection === "incoming"/);
 assert.match(panel,/Reply waiting/);
});

test("conversation search and selected chat appear before summary counts", () => {
  const markup = panel.slice(panel.indexOf('panel.innerHTML = `'), panel.indexOf('  grid.prepend(panel);'));
  assert.ok(markup.indexOf('id="conversation-search"') < markup.indexOf('id="conversation-list"'));
  assert.ok(markup.indexOf('id="conversation-list"') < markup.indexOf('id="conversation-operational-summary"'));
});

test("empty synced history explains the difference between an unused match and a missing import", () => {
  assert.match(panel, /No messages saved for this match yet/);
  assert.match(panel, /Import visible chat \(read-only\)/);
  assert.match(panel, /A new match may have no history yet/);
  assert.match(panel, /data-refresh-conversation/);
  assert.match(panel, /querySelector<HTMLButtonElement>\("\[data-refresh-conversation\]"\)/);
  assert.match(panel, /void refresh\(\)/);
});
