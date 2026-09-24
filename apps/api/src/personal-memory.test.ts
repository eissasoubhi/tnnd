import assert from "node:assert/strict";
import test from "node:test";
import { validatePersonalMemoryAnalysis } from "./personal-memory.js";

const valid = {
  title: "A neutral story",
  type: "experience",
  summary: "A short grounded summary.",
  immutableFacts: ["A fact supplied by the user"],
  topics: ["travel"],
  conversationHooks: ["Ask about a similar experience"],
  sensitivity: "normal",
  allowedForChat: true,
  creativeFreedom: "natural"
};

test("accepts a grounded personal-memory analysis", () => {
  assert.deepEqual(validatePersonalMemoryAnalysis(valid), { ok: true });
});

test("requires immutable facts", () => {
  assert.deepEqual(validatePersonalMemoryAnalysis({ ...valid, immutableFacts: [] }), { ok: false, error: "immutable_facts_required" });
});

test("requires an explicit chat permission", () => {
  const { allowedForChat: _removed, ...input } = valid;
  assert.deepEqual(validatePersonalMemoryAnalysis(input), { ok: false, error: "invalid_allowed_for_chat" });
});

test("rejects unsupported creative freedom", () => {
  assert.deepEqual(validatePersonalMemoryAnalysis({ ...valid, creativeFreedom: "unsupported" }), { ok: false, error: "invalid_creative_freedom" });
});
