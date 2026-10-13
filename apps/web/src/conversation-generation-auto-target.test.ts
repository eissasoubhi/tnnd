import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { draftFailureGuidance } from "./draft-failure-guidance";

const here = dirname(fileURLToPath(import.meta.url));
const draft = readFileSync(resolve(here,"conversation-overrides-panel.ts"),"utf8");
const client = readFileSync(resolve(here,"conversation-generation-client.ts"),"utf8");
const conversations = readFileSync(resolve(here,"conversation-panel.ts"),"utf8");

test("draft can be generated without a manual latestMessage input", () => {
  assert.match(draft, /Generate a reply from synced chat/);
  assert.match(draft, /Advanced · Test another message manually \(optional\)/);
  assert.doesNotMatch(draft, /No received message was imported\. Open this chat/);
  assert.match(client, /\.\.\.\(latestMessage\.trim\(\) \? \{ latestMessage:/);
});
test("unavailable match history has concrete guidance", () => {
  assert.match(draftFailureGuidance("no_synced_incoming_message"), /Import visible chat \(read-only\)/);
});
test("unnamed conversation shows explicit name and age editor", () => {
  assert.match(conversations, /Tinder identity not yet detected/);
  assert.match(conversations, /class="conversation-identity-editor"/);
  assert.match(conversations, /data-save-conversation-identity>Save match name/);
});
