import assert from "node:assert/strict";
import test from "node:test";
import { parseIdentityStructuredAnalysis } from "./identity-builder-contract.js";

test("identity analysis contract keeps compact reusable fields", () => {
  const parsed = parseIdentityStructuredAnalysis({
    summary: "Software engineer who enjoys travel and relaxed social plans.",
    stableFacts: ["Works in software"],
    interests: ["travel", "movies"],
    lifestyle: ["often cooks in the evening"],
    preferences: ["likes casual restaurants"],
    personalityTraits: ["calm"],
    conversationTopics: ["technology", "travel"],
    avoidTopics: []
  });
  assert.equal(parsed.summary.includes("Software"), true);
  assert.deepEqual(parsed.interests, ["travel", "movies"]);
});

test("identity analysis rejects oversized lists", () => {
  assert.throws(() => parseIdentityStructuredAnalysis({
    summary: "x",
    stableFacts: [],
    interests: Array.from({ length: 21 }, () => "x"),
    lifestyle: [],
    preferences: [],
    personalityTraits: [],
    conversationTopics: [],
    avoidTopics: []
  }), /invalid_identity_interests/);
});
