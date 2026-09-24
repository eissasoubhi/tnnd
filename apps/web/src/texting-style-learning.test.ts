import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_STYLE_EXAMPLE_CHARS,
  approveStyleAnalysis,
  approvedStylePreferences,
  createTextingStyleLearningDraft,
  editStyleAnalysis,
  markStyleAnalysisReviewed,
  normalizeStyleExamples,
  setStyleAnalysis,
  setStyleExamples,
  styleAnalysisRequest
} from "./texting-style-learning";

const analysis = {
  datingGoal: "open-to-see",
  disclosureStrategy: "progressive",
  formality: "casual",
  capitalization: "mostly-lowercase",
  emojiFrequency: "low",
  abbreviations: "medium",
  messageLength: "short",
  punctuationDensity: "low",
  slangLevel: "medium",
  fragmentStyle: "frequent",
  grammarStyle: "casual",
  directness: "medium",
  questionFrequency: "medium",
  teasingStyle: "playful",
  humorStyle: "dry",
  doubleTexting: "avoid",
  frenchStyle: "casual",
  darijaStyle: "natural",
  englishStyle: "casual"
};

test("normalizes examples and keeps retention opt-in explicit", () => {
  const draft = setStyleExamples(createTextingStyleLearningDraft(), "  salut\r\nça va ?  ", true);
  assert.equal(draft.sourceExamples, "salut\nça va ?");
  assert.deepEqual(styleAnalysisRequest(draft), {
    examples: "salut\nça va ?",
    retainSourceExamples: true
  });

  const noOptIn = setStyleExamples(createTextingStyleLearningDraft(), "hello");
  assert.equal(styleAnalysisRequest(noOptIn)?.retainSourceExamples, false);
  assert.equal(styleAnalysisRequest(setStyleExamples(noOptIn, "   ")), null);
});

test("caps source examples before they are sent for analysis", () => {
  const oversized = ` ${"x".repeat(MAX_STYLE_EXAMPLE_CHARS + 50)} `;
  assert.equal(normalizeStyleExamples(oversized).length, MAX_STYLE_EXAMPLE_CHARS);
});

test("requires review before approval and exposes preferences only after approval", () => {
  let draft = setStyleAnalysis(setStyleExamples(createTextingStyleLearningDraft(), "hey"), analysis);
  assert.equal(approvedStylePreferences(draft), null);
  assert.throws(() => approveStyleAnalysis(draft), /style_analysis_review_required/);

  draft = markStyleAnalysisReviewed(draft);
  assert.equal(approvedStylePreferences(draft), null);
  draft = approveStyleAnalysis(draft);
  assert.deepEqual(approvedStylePreferences(draft), analysis);
});

test("editing an analyzed profile invalidates prior review and approval", () => {
  let draft = setStyleAnalysis(setStyleExamples(createTextingStyleLearningDraft(), "hey"), analysis);
  draft = approveStyleAnalysis(markStyleAnalysisReviewed(draft));
  assert.equal(draft.approved, true);

  draft = editStyleAnalysis(draft, { directness: "high" });
  assert.equal(draft.analysis?.directness, "high");
  assert.equal(draft.reviewed, false);
  assert.equal(draft.approved, false);
  assert.equal(approvedStylePreferences(draft), null);
});

test("changing source examples invalidates stale analysis", () => {
  let draft = setStyleAnalysis(setStyleExamples(createTextingStyleLearningDraft(), "first"), analysis);
  draft = approveStyleAnalysis(markStyleAnalysisReviewed(draft));

  draft = setStyleExamples(draft, "second", false);
  assert.equal(draft.analysis, null);
  assert.equal(draft.reviewed, false);
  assert.equal(draft.approved, false);
  assert.equal(draft.retainSourceExamples, false);
});
