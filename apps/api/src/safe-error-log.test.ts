import assert from "node:assert/strict";
import test from "node:test";
import { safeApiErrorLog, safeErrorName } from "./safe-error-log.js";

test("safe API error logging never includes message, stack or cause content", () => {
  const error = new Error("secret message body: hello@example.invalid");
  error.name = "DatabaseError";
  error.stack = "STACK_WITH_SECRET_TOKEN";
  (error as Error & { cause?: unknown }).cause = new Error("nested secret");

  const logged = safeApiErrorLog(error);

  assert.equal(logged, JSON.stringify({ event: "api_request_failed", error: "DatabaseError" }));
  assert.doesNotMatch(logged, /secret|example\.invalid|STACK|nested/i);
});

test("unsafe or attacker-controlled error names are reduced to Error", () => {
  const error = new Error("hidden");
  error.name = "Bad Name\nleak";
  assert.equal(safeErrorName(error), "Error");
});

test("non Error values are reported without serializing their contents", () => {
  const value = { token: "do-not-log" };
  assert.equal(
    safeApiErrorLog(value),
    JSON.stringify({ event: "api_request_failed", error: "UnknownError" })
  );
});
