import assert from "node:assert/strict";
import test from "node:test";
import { rankPersonalMemories } from "./personal-memory-retrieval.js";
import type { StoredPersonalMemory } from "./personal-memory-service.js";

function memory(overrides: Partial<StoredPersonalMemory> & { id: string; topics?: string[] }): StoredPersonalMemory {
  const { topics = ["travel"], ...rest } = overrides;
  return {
    id: overrides.id,
    originalText: "source",
    structuredAnalysis: {
      title: overrides.id,
      category: "story",
      summary: "summary",
      immutableFacts: ["fact"],
      topics,
      conversationHooks: [],
      sensitivity: "low",
      allowedForChat: true,
      creativeFreedom: "natural"
    },
    reviewStatus: "approved",
    approvedAt: "2026-09-01T00:00:00.000Z",
    lastUsedAt: null,
    usageCount: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...rest
  };
}

test("retrieval keeps only approved memories allowed for chat", () => {
  const draft = memory({ id: "draft", reviewStatus: "draft" });
  const privateMemory = memory({
    id: "private",
    structuredAnalysis: { ...memory({ id: "base" }).structuredAnalysis, allowedForChat: false }
  });
  const approved = memory({ id: "approved" });
  const ranked = rankPersonalMemories([draft, privateMemory, approved], { topics: ["travel"] });
  assert.deepEqual(ranked.map((item) => item.memory.id), ["approved"]);
});

test("topic overlap wins while recent repeated memories are penalized", () => {
  const now = new Date("2026-09-15T00:00:00.000Z");
  const fresh = memory({ id: "fresh", topics: ["travel", "japan"], usageCount: 0 });
  const repeated = memory({
    id: "repeated",
    topics: ["travel", "japan"],
    usageCount: 6,
    lastUsedAt: "2026-09-14T23:00:00.000Z"
  });
  const weak = memory({ id: "weak", topics: ["travel"] });
  const ranked = rankPersonalMemories([repeated, weak, fresh], { topics: ["travel", "japan"], now, limit: 3 });
  assert.deepEqual(ranked.map((item) => item.memory.id), ["fresh", "repeated", "weak"]);
  assert.deepEqual(ranked[0]?.matchedTopics, ["travel", "japan"]);
  assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));
});

test("unrelated memories are not forced into a topic retrieval", () => {
  const ranked = rankPersonalMemories([
    memory({ id: "food", topics: ["food"] }),
    memory({ id: "music", topics: ["music"] })
  ], { topics: ["travel"] });
  assert.deepEqual(ranked, []);
});

test("retrieval limits top-k and rejects invalid limits", () => {
  const memories = Array.from({ length: 10 }, (_, index) => memory({ id: String(index) }));
  assert.equal(rankPersonalMemories(memories, { topics: ["travel"], limit: 2 }).length, 2);
  assert.throws(() => rankPersonalMemories(memories, { limit: 0 }), /invalid_personal_memory_retrieval_limit/);
});
