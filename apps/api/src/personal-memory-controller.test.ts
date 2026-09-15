import assert from "node:assert/strict";
import test from "node:test";
import { handlePersonalMemoryGetRequest, handlePersonalMemoryUpdateRequest } from "./personal-memory-controller.js";

test("personal memory controller rejects missing ids before DB access", async () => {
  assert.deepEqual(await handlePersonalMemoryGetRequest("user", ""), {
    status: 400,
    body: { error: "missing_personal_memory_id" }
  });
  assert.deepEqual(await handlePersonalMemoryUpdateRequest("user", "   ", {}), {
    status: 400,
    body: { error: "missing_personal_memory_id" }
  });
});
