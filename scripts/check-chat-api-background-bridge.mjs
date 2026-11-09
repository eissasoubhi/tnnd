import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  validateBoundaryObservation, validateBoundaryBridgeDecision, safeBoundaryBridgeFailure
} from "../src/tinder-conversation-boundary-bridge.ts";
import { explainSemanticCheckFailure } from "../src/chat-auto-reply-diagnostics.ts";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("validates only bounded incoming Tinder observations; rejects forged and oversized requests", () => {
  assert.deepEqual(validateBoundaryObservation("fixture-thread", [
    {direction:"outgoing",text:"Salut"},{direction:"incoming",text:"Coucou"}
  ]), {externalThreadId:"fixture-thread",messages:[
    {direction:"outgoing",text:"Salut"},{direction:"incoming",text:"Coucou"}]});
  for (const [ref,messages] of [
    ["fixture/thread",[{direction:"incoming",text:"hi"}]],
    ["a".repeat(513),[{direction:"incoming",text:"hi"}]],
    ["fixture",[]],
    ["fixture",Array(13).fill({direction:"incoming",text:"hi"})],
    ["fixture",[{direction:"outgoing",text:"hi"}]],
    ["fixture",[{direction:"incoming",text:""}]],
    ["fixture",[{direction:"incoming",text:"A".repeat(4001)}]],
    ["fixture",[{direction:"unknown",text:"hi"}]]
  ]) assert.equal(validateBoundaryObservation(ref,messages),null);
});

test("semantic outcomes must be explicit; never assume continue from invalid JSON or missing kind", () => {
  assert.deepEqual(validateBoundaryBridgeDecision({kind:"continue",platform:null}),
    {kind:"continue",platform:null});
  assert.deepEqual(validateBoundaryBridgeDecision({kind:"unknown",platform:null}),
    {kind:"unknown",platform:null});
  for (const response of [null,{}, {kind:"send-now"}, {kind:"continue",platform:"instagram"},
    {kind:"off-tinder",platform:null}, {kind:"unknown",platform:"malicious"}])
    assert.equal(validateBoundaryBridgeDecision(response),null);
});

test("only allowlisted API failure codes are exposed to activity journal", () => {
  assert.equal(safeBoundaryBridgeFailure("conversation_ai_provider_not_configured",503),
    "conversation_ai_provider_not_configured");
  assert.equal(safeBoundaryBridgeFailure("Bearer sk-secret and request body",503),
    "conversation_semantic_check_unavailable");
  assert.equal(safeBoundaryBridgeFailure("arbitrary error body",401),"invalid_or_expired_session");
  assert.match(explainSemanticCheckFailure("conversation_boundary_backend_unreachable"),/127\.0\.0\.1:4000/);
  assert.match(explainSemanticCheckFailure("conversation_boundary_bridge_unavailable"),/Recharge/);
});

test("Tinder script does not make a CORS-blocked semantic fetch; worker owns host-authorized call", async () => {
  const [sync, background, manifest, content] = await Promise.all([
    "src/conversation-sync.ts", "src/background.ts","public/manifest.json", "src/content.ts"
  ].map(read));
  assert.doesNotMatch(sync,/fetch\(API_BASE \+ "\/api\/v1\/conversations\/observed-boundary"/);
  assert.match(sync,/chrome\.runtime\.sendMessage\(\{/);
  assert.match(sync,/type: "TNND_OBSERVE_CONVERSATION_BOUNDARY"/);
  assert.match(background,/currentAuthorizedTinderThread\(sender, observed\.externalThreadId\)/);
  assert.match(background,/mayAutomaticallySendToTinder\(management\)/);
  assert.match(background,/validateBoundaryObservation\(message\.externalThreadId, message\.messages\)/);
  assert.match(background,/fetch\("http:\/\/127\.0\.0\.1:4000\/api\/v1\/conversations\/observed-boundary"/);
  assert.match(background,/validateBoundaryBridgeDecision\(payload\?\.boundary\)/);
  assert.match(manifest, /"http:\/\/127\.0\.0\.1\/\*"/);
  assert.match(content,/await syncObservedConversationBoundary\(conversationRef,visible\)/);
  assert.match(content,/await backendAutomaticReplyPermission\(conversationRef\)/);
  assert.match(content,/await adapter\.send\(part\)/);
  assert.match(content,/type: "TNND_SYNC_SENT_TINDER_BUBBLE"/);
  assert.doesNotMatch(content,/await syncConversationDelta\(conversationRef/);
});
