import assert from "node:assert/strict";
import test from "node:test";
import { normalizePersonalMemoryUsageIds } from "./personal-memory-service.js";

test("normalizes and de-duplicates bounded Personal Memory usage ids", () => {
  assert.deepEqual(normalizePersonalMemoryUsageIds([" a ", "b", "a"]), ["a", "b"]);
});

test("rejects empty, malformed and oversized Personal Memory usage batches", () => {
  assert.throws(() => normalizePersonalMemoryUsageIds([]), /invalid_personal_memory_usage_ids/);
  assert.throws(() => normalizePersonalMemoryUsageIds(["ok", ""]), /invalid_personal_memory_usage_ids/);
  assert.throws(() => normalizePersonalMemoryUsageIds(Array.from({ length: 11 }, (_, index) => `id-${index}`)), /invalid_personal_memory_usage_ids/);
});
