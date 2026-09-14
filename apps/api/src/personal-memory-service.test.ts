import assert from "node:assert/strict";
import test from "node:test";
import { canApprovePersonalMemory, normalizePersonalMemoryOriginalText } from "./personal-memory-service.js";
import { parsePersonalMemoryStructuredAnalysis } from "./personal-memory-contract.js";

const validAnalysis = parsePersonalMemoryStructuredAnalysis({
  title: "A grounded story",
  category: "experience",
  summary: "A concise summary.",
  immutableFacts: ["The event happened."],
  topics: ["life"],
  conversationHooks: ["A natural hook"],
  sensitivity: "low",
  allowedForChat: true,
  creativeFreedom: "natural"
});

test("normalizes raw personal memory text without changing its meaning", () => {
  assert.equal(normalizePersonalMemoryOriginalText("  A real anecdote.  "), "A real anecdote.");
});

test("rejects missing and oversized source text", () => {
  assert.throws(() => normalizePersonalMemoryOriginalText("   "), /invalid_original_text/);
  assert.throws(() => normalizePersonalMemoryOriginalText("x".repeat(20_001)), /invalid_original_text/);
});

test("requires grounded immutable facts before approval", () => {
  assert.equal(canApprovePersonalMemory(validAnalysis), true);
  assert.equal(canApprovePersonalMemory({ ...validAnalysis, immutableFacts: [] }), false);
});
