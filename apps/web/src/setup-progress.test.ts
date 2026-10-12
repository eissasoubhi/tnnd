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


test("historically frequent sport topics outrank a recent travel chat", () => {
  const topics = [
    { topic: "travel", messageCount: 2, conversationCount: 1, lastDiscussedAt: "2026-10-12T11:00:00Z" },
    { topic: "football", messageCount: 60, conversationCount: 9, lastDiscussedAt: "2026-03-01T11:00:00Z" }
  ];
  const found = missingStoryRecommendations([], [], Date.parse("2026-10-12T12:00:00Z"), topics);
  assert.deepEqual(found.map(r => r.id), ["sports", "travel"]);
  assert.equal(found[0].messageCount, 60);
  assert.deepEqual(missingStoryRecommendations([], [], Date.now(), topics, ["sports"]).map(r => r.id), ["travel"]);
});
test("approved sport story removes the recommendation; unapproved stories do not", () => {
  const topic = [{ topic: "sport", messageCount: 30, conversationCount: 5 }];
  const draft = { reviewStatus: "draft", structuredAnalysis: { title: "Football match", category: "sports", allowedForChat: true } };
  assert.equal(missingStoryRecommendations([], [draft], Date.now(), topic).length, 1);
  assert.equal(missingStoryRecommendations([], [{ ...draft, reviewStatus: "approved" }], Date.now(), topic).length, 0);
  assert.equal(missingStoryRecommendations([], [{ ...draft, reviewStatus: "approved", structuredAnalysis: { ...draft.structuredAnalysis, allowedForChat: false } }], Date.now(), topic).length, 1);
});
test("frequent custom topics are eligible without inferring sensitive personal details", () => {
  const topics = [{ topic: "photography", messageCount: 20, conversationCount: 3 }, { topic: "health", messageCount: 20, conversationCount: 5 }];
  const found = missingStoryRecommendations([], [], Date.now(), topics);
  assert.deepEqual(found.map(r=>r.id), ["topic:photography"]);
});
