import assert from "node:assert/strict";
import test from "node:test";
import { routePersonalMemoryRequest } from "./personal-memory-http-router.js";

// Route-shape regression tests deliberately exercise unmatched paths only so they
// remain DB-free. Controller/service behavior is covered by their focused tests.
test("does not claim unrelated API routes", async () => {
  assert.deepEqual(
    await routePersonalMemoryRequest("user-1", { method: "GET", pathname: "/api/v1/conversations" }),
    { matched: false }
  );
});

test("does not claim unsupported Personal Memory methods", async () => {
  assert.deepEqual(
    await routePersonalMemoryRequest("user-1", { method: "OPTIONS", pathname: "/api/v1/personal-memories" }),
    { matched: false }
  );
  assert.deepEqual(
    await routePersonalMemoryRequest("user-1", { method: "POST", pathname: "/api/v1/personal-memories/memory-1" }),
    { matched: false }
  );
});

test("rejects malformed nested Personal Memory paths", async () => {
  assert.deepEqual(
    await routePersonalMemoryRequest("user-1", { method: "GET", pathname: "/api/v1/personal-memories/a/b" }),
    { matched: false }
  );
});
