import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateLiveChatTail } from "../src/tinder-live-chat-tail-sync.ts";
const read = file => readFile(new URL("../"+file,import.meta.url),"utf8");

test("visible transcript imports stable message keys without changing sender or contents", () => {
  const input=[{key:"k1",direction:"me",text:"Salut"}, {key:"k2",direction:"them",text:"Coucou"}];
  assert.deepEqual(validateLiveChatTail(input),input);
  assert.equal(validateLiveChatTail([{key:"k1",direction:"me",text:"Salut"}]),null);
  assert.equal(validateLiveChatTail([{key:"k1",direction:"them",text:"Hi"},{key:"k1",direction:"them",text:"Again"}]),null);
  for(const bad of [
    [], Array(13).fill({key:"x",direction:"them",text:"Hello"}),
    [{key:"../",direction:"them",text:"Hi"}],
    [{key:"abc",direction:"them",text:""}],
    [{key:"abc",direction:"them",text:"A".repeat(4001)}],
    [{key:"abc",direction:"unknown",text:"Hi"}]
  ]) assert.equal(validateLiveChatTail(bad),null);
});

test("read-only sync from Tinder is gated on the currently opened thread and never grants AI consent",async()=>{
  const [background,content,api,fixture] = await Promise.all([
    "src/background.ts", "src/content.ts",
    "apps/api/src/conversation-service.ts","e2e/extension.spec.mjs"
  ].map(read));
  assert.match(background,/type: "TNND_SYNC_OPENED_CHAT_HISTORY"/);
  assert.match(background,/currentAuthorizedTinderThread\(sender, ref\)/);
  assert.match(background,/prepareReadOnlyImport\(visible, Boolean\(existing\.conversationId\)/);
  assert.match(background,/readOnlyImport:true/);
  assert.match(background,/existing\.conversationId \? \{\} : \{ status:"paused" \}/);
  assert.match(background,/!response\.ok/);
  assert.match(content,/buildNormalizedMessageKeys\(/);
  assert.match(content,/keyed\.every\(/);
  assert.match(content,/TNND_SYNC_OPENED_CHAT_HISTORY/);
  assert.match(content,/if \(imported\.created\)/);
  assert.match(content,/const backendPermission = await backendAutomaticReplyPermission\(conversationRef\)/);
  assert.ok(content.indexOf("TNND_SYNC_OPENED_CHAT_HISTORY") < content.indexOf("const backendPermission = await backendAutomaticReplyPermission(conversationRef)"));
  assert.match(api,/ON CONFLICT \(conversation_id, external_message_id\) DO NOTHING/);
  assert.match(api,/if \(!input\.readOnlyImport && acceptedOutgoingCount > 0\)/);
  assert.match(fixture,/classifyIndex.*toBeGreaterThan\(syncIndex\)/);
});

test("semantic unknown has a safe separate cause from outdated backend history",async()=>{
  const [api,service,bridge,content] = await Promise.all([
    "apps/api/src/main.ts","apps/api/src/conversation-boundary-service.ts",
    "src/tinder-conversation-boundary-bridge.ts","src/content.ts"
  ].map(read));
  assert.match(service,/observedTailMismatch\(/);
  assert.match(service,/diagnostic:"conversation_not_persisted"/);
  assert.match(service,/diagnostic: sameTail \? uncertainReason/);
  assert.match(bridge,/safeSemanticDiagnostic/);
  assert.match(api,/sendJson\(response, 200, result\)/);
  assert.match(content,/semantic_decision_uncertain: "L'IA ne peut pas confirmer/);
  assert.match(content,/latest_message_mismatch: "Contrôle IA bloqué/);
});
