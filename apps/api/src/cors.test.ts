import assert from "node:assert/strict";
import test from "node:test";
import { resolveCorsOrigin } from "./cors.js";

test("local Vite origins are allowed outside production", () => {
  assert.equal(resolveCorsOrigin("http://127.0.0.1:5173", "development", ""), "http://127.0.0.1:5173");
  assert.equal(resolveCorsOrigin("http://localhost:5173", undefined, ""), "http://localhost:5173");
});

test("production requires an explicitly configured origin", () => {
  assert.equal(resolveCorsOrigin("http://localhost:5173", "production", ""), null);
  assert.equal(
    resolveCorsOrigin("https://app.example.test", "production", "https://app.example.test"),
    "https://app.example.test"
  );
});

test("unknown origins stay blocked", () => {
  assert.equal(resolveCorsOrigin("https://evil.example", "development", ""), null);
  assert.equal(resolveCorsOrigin(undefined, "development", ""), null);
});
