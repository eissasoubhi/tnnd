import assert from "node:assert/strict";
import test from "node:test";
import { routeAuthenticatedPersonalMemoryRequest } from "./personal-memory-authenticated-route.js";

test("does not claim unrelated API routes before authentication", async () => {
  assert.deepEqual(
    await routeAuthenticatedPersonalMemoryRequest({ method: "GET", pathname: "/api/v1/conversations" }),
    { matched: false }
  );
});

test("rejects Personal Memory routes without a bearer token", async () => {
  assert.deepEqual(
    await routeAuthenticatedPersonalMemoryRequest({ method: "GET", pathname: "/api/v1/personal-memories" }),
    { matched: true, status: 401, body: { error: "invalid_or_expired_session" } }
  );
});

test("rejects empty bearer credentials without touching persistence", async () => {
  assert.deepEqual(
    await routeAuthenticatedPersonalMemoryRequest({
      authorization: "Bearer   ",
      method: "POST",
      pathname: "/api/v1/personal-memories",
      body: { originalText: "not persisted" }
    }),
    { matched: true, status: 401, body: { error: "invalid_or_expired_session" } }
  );
});
