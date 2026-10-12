import assert from "node:assert/strict";
import test from "node:test";
import { identityEditorPresentation } from "./identity-editor-presentation";
import type { IdentityBuilderState } from "./identity-builder-client";
const make = (reviewStatus: "approved"|"draft"): IdentityBuilderState => ({
  reviewStatus, sourceText: "hello", sourceHash:"hash", analyzedAt:"2026-10-12T00:00:00Z", approvedAt:null, analysisModel:"gemini",
  analysis: { summary:"A calm, playful user",stableFacts:["Lives in Paris"],interests:[],lifestyle:[],preferences:[],personalityTraits:[],conversationTopics:["travel"],avoidTopics:[] }
});
test("approved identity is compact, but remains editable", () => {
  assert.deepEqual(identityEditorPresentation(make("approved")), {
    showApprovedSummary:true,openSource:false,openReview:false,showApprove:false,summary:"A calm, playful user",factCount:1,topicCount:1
  });
});
test("draft, changed source and unsaved review all expand relevant actions", () => {
  const draft = identityEditorPresentation(make("draft"));
  assert.equal(draft.openSource,true);
  assert.equal(draft.openReview,true);
  assert.equal(draft.showApprove,true);
  assert.equal(identityEditorPresentation(make("approved"),true).showApprovedSummary,false);
  assert.equal(identityEditorPresentation(make("approved"),false,true).showApprove,true);
  assert.equal(identityEditorPresentation(null).openReview,false);
});
