import assert from "node:assert/strict";
import test from "node:test";
import { UNCERTAIN_BOUNDARY, type StructuredBoundaryDecision } from "../../../src/conversation-boundary-policy.js";
import {
  desiredBoundaryTransition, handoffProvenance, validateObservedConversationBoundary,
  verifiedConversationBoundary
} from "./conversation-boundary-service.js";

function outcome(kind: StructuredBoundaryDecision["kind"],
  evidence: StructuredBoundaryDecision["evidence"],
  platform: StructuredBoundaryDecision["platform"] = null): StructuredBoundaryDecision {
  return {kind,evidence,platform,confidence:0.98};
}
const exchange = (...rows: Array<["incoming"|"outgoing",string]>) =>
  rows.map(([direction,text])=>({direction,text}));

test("normal standalone farewell has no transition when AI determines conversation continues",()=>{
  const observed = validateObservedConversationBoundary({
    externalThreadId:"thread-1",
    messages:exchange(["outgoing","How was your day?"],["incoming","Bonne soirée"])
  });
  const verified = verifiedConversationBoundary(observed.messages,observed.messages,outcome("continue","ongoing"));
  assert.equal(verified.kind,"continue");
  assert.equal(desiredBoundaryTransition(verified),null);
});
test("AI mutual goodbyes pause chat; acknowledgement does not alter server status",()=>{
  const messages=exchange(["outgoing","Good night"],["incoming","You too"]);
  const result=verifiedConversationBoundary(messages,messages,outcome("rest","mutual-signoff"));
  assert.deepEqual(desiredBoundaryTransition(result),{status:"waiting-for-them",managementState:"ai-managed"});
  assert.equal(desiredBoundaryTransition(outcome("acknowledgement","plain-acknowledgement")),null);
});
test("explicit handoff and contact refusal require verified message tail",()=>{
  const history=exchange(["outgoing","Let's talk on WhatsApp"],["incoming","Okay"]);
  assert.deepEqual(desiredBoundaryTransition(verifiedConversationBoundary(
    history,history,outcome("off-tinder","accepted-handoff","whatsapp"))),{
    status:"moved-off-tinder",managementState:"moved-off-tinder"
  });
  assert.deepEqual(desiredBoundaryTransition(verifiedConversationBoundary(
    exchange(["incoming","Stop messaging me"]),exchange(["incoming","Stop messaging me"]),
    outcome("do-not-contact","explicit-stop")
  )),{status:"disabled",managementState:"unmanaged"});
});
test("reject arbitrary status, oversized history, outgoing-only and unsupported directions", () => {
  const baseline = {externalThreadId:"thread-4",messages:[{direction:"incoming",text:"Bye"}]};
  assert.throws(()=>validateObservedConversationBoundary({...baseline,messages:[]}),/invalid_conversation_boundary/);
  assert.throws(()=>validateObservedConversationBoundary({...baseline,messages:[{direction:"outgoing",text:"Bye"}]}),/invalid_conversation_boundary/);
  assert.throws(()=>validateObservedConversationBoundary({...baseline,messages:[{direction:"unknown",text:"Bye"}]}),/invalid_conversation_boundary/);
  assert.throws(()=>validateObservedConversationBoundary({...baseline,messages:Array(13).fill(baseline.messages[0])}),/invalid_conversation_boundary/);
  assert.throws(()=>validateObservedConversationBoundary({...baseline,externalThreadId:"a".repeat(513)}),/invalid_conversation_boundary/);
});
test("a forged or stale observation can never confirm a Gemini decision",()=>{
  const stored=exchange(["outgoing","On se voit demain ?"],["incoming","Je sais pas encore."]);
  const forged=exchange(["outgoing","On passe sur Insta ?"],["incoming","OK"]);
  assert.deepEqual(verifiedConversationBoundary(forged,stored,
    outcome("off-tinder","accepted-handoff","instagram")),UNCERTAIN_BOUNDARY);
  assert.deepEqual(verifiedConversationBoundary(exchange(["incoming","Ne m'écris plus"]),stored,
    outcome("do-not-contact","explicit-stop")),UNCERTAIN_BOUNDARY);
  const newer=[...stored,{direction:"incoming" as const,text:"Salut ça va ?"}];
  assert.deepEqual(verifiedConversationBoundary(stored,newer,outcome("continue","ongoing")),UNCERTAIN_BOUNDARY);
});
test("AI cannot confirm mutual goodbye or accepted handoff from single-message observation",()=>{
  const history=exchange(["outgoing","Bonne nuit"],["incoming","Bye"]);
  assert.deepEqual(verifiedConversationBoundary(history.slice(-1),history,outcome("rest","mutual-signoff")),UNCERTAIN_BOUNDARY);
  assert.deepEqual(verifiedConversationBoundary(history.slice(-1),history,outcome("off-tinder","accepted-handoff","instagram")),UNCERTAIN_BOUNDARY);
  assert.equal(verifiedConversationBoundary(history.slice(-1),history,outcome("do-not-contact","explicit-stop")).kind,"do-not-contact");
  assert.equal(verifiedConversationBoundary(history.slice(-1),history,outcome("off-tinder","direct-handoff","telegram")).kind,"off-tinder");
});
test("persisted platform provenance requires a verified latest incoming source ID",()=>{
  const boundary=outcome("off-tinder","direct-handoff","instagram");
  assert.deepEqual(handoffProvenance(boundary,{direction:"incoming",external_message_id:"synced-inbound-id"}),{
    platform:"instagram",sourceExternalMessageId:"synced-inbound-id"
  });
  assert.equal(handoffProvenance(boundary,{direction:"outgoing",external_message_id:"synced-outbound-id"}),null);
  assert.equal(handoffProvenance(boundary,{direction:"incoming",external_message_id:""}),null);
  assert.equal(handoffProvenance(outcome("continue","ongoing"),{direction:"incoming",external_message_id:"id"}),null);
  assert.equal(handoffProvenance(outcome("rest","mutual-signoff"),{direction:"incoming",external_message_id:"id"}),null);
});
