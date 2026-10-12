import test from "node:test";
import assert from "node:assert/strict";
import { missingStoryRecommendations, profileReadiness, setupProgress } from "../../../src/setup-progress";

test("checklist has a deterministic ordered next step and never claims an unknown percent", () => {
  assert.equal(setupProgress({ signedIn: false, identityApproved: false, geminiConfigured: false, preferencesConfigured: false }).percent, 0);
  const progress = setupProgress({ signedIn: true, identityApproved: true, geminiConfigured: false, preferencesConfigured: false });
  assert.equal(progress.percent, 50);
  assert.equal(progress.next?.id, "gemini");
  assert.equal(setupProgress({ signedIn: true, identityApproved: null, geminiConfigured: true, preferencesConfigured: true }).percent, null);
  assert.equal(setupProgress({ signedIn: true, identityApproved: true, geminiConfigured: true, preferencesConfigured: true }).percent, 100);
});
test("approved Identity Builder and actually saved preferences are required", () => {
  assert.deepEqual(profileReadiness({ identityBuilder: { reviewStatus: "draft", analysis: { summary: "Hi" } } }), { identityApproved: false, preferencesConfigured: false });
  assert.deepEqual(profileReadiness({ identityBuilder: { reviewStatus: "approved", analysis: { summary: "Hi" } }, datingIntent: { defaultGoal: "open-to-see" }, textingStyle: { formality: "casual" } }), { identityApproved: true, preferencesConfigured: true });
});
test("recommend only missing, relevant real anecdotes; no inference from unapproved memories", () => {
  const conversations = [{ currentTopic: "Voyage", status: "active" }, { currentTopic: "travail", status: "active" }];
  assert.deepEqual(missingStoryRecommendations(conversations, []).map(v=>v.id), ["travel", "work"]);
  assert.deepEqual(missingStoryRecommendations(conversations, [{ reviewStatus: "approved", structuredAnalysis: { category: "travel", title: "Paris" } }]).map(v=>v.id), ["work"]);
  assert.deepEqual(missingStoryRecommendations(conversations, [{ reviewStatus: "draft", structuredAnalysis: { category: "travel" } }]).map(v=>v.id), ["travel", "work"]);
  assert.deepEqual(missingStoryRecommendations([{ currentTopic: "travel", status: "archived" }], []), []);
  assert.deepEqual(missingStoryRecommendations([{ currentTopic: "travel", status: "active", lastMessageAt: "2020-01-01T00:00:00Z" }], [], Date.parse("2026-10-12T00:00:00Z")), []);
});
