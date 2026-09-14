import assert from "node:assert/strict";
import test from "node:test";
import { PersonalMemoryContractError, parsePersonalMemoryStructuredAnalysis } from "./personal-memory-contract.js";

const valid = {
  title: "Weekend hiking story",
  category: "travel",
  summary: "A short grounded summary.",
  immutableFacts: ["Went hiking with friends"],
  topics: ["travel", "weekend"],
  conversationHooks: ["Ask about outdoor trips"],
  sensitivity: "low",
  allowedForChat: true,
  creativeFreedom: "natural"
} as const;

test("parses and normalizes a valid Personal Memory analysis", () => {
  const parsed = parsePersonalMemoryStructuredAnalysis(valid);
  assert.equal(parsed.title, valid.title);
  assert.deepEqual(parsed.immutableFacts, valid.immutableFacts);
  assert.equal(parsed.creativeFreedom, "natural");
});

test("rejects invented contract values and missing chat permission", () => {
  assert.throws(
    () => parsePersonalMemoryStructuredAnalysis({ ...valid, sensitivity: "secret" }),
    (error) => error instanceof PersonalMemoryContractError && error.code === "invalid_sensitivity"
  );
  const { allowedForChat: _ignored, ...withoutPermission } = valid;
  assert.throws(
    () => parsePersonalMemoryStructuredAnalysis(withoutPermission),
    (error) => error instanceof PersonalMemoryContractError && error.code === "invalid_allowed_for_chat"
  );
});

test("bounds arrays and text lengths before persistence", () => {
  assert.throws(
    () => parsePersonalMemoryStructuredAnalysis({ ...valid, topics: Array.from({ length: 21 }, (_, index) => `topic-${index}`) }),
    (error) => error instanceof PersonalMemoryContractError && error.code === "invalid_topics"
  );
  assert.throws(
    () => parsePersonalMemoryStructuredAnalysis({ ...valid, summary: "x".repeat(1001) }),
    (error) => error instanceof PersonalMemoryContractError && error.code === "invalid_summary"
  );
});
