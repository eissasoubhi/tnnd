import assert from "node:assert/strict";
import test from "node:test";
import { handlePlatformHttpRoute } from "./platform-http-handler.js";

test("platform HTTP handler sends metadata responses", async () => {
  const responses: Array<{ status: number; body: unknown }> = [];
  const handled = await handlePlatformHttpRoute(
    "GET",
    "/api/v1/meta",
    async () => null,
    (status, body) => responses.push({ status, body })
  );

  assert.equal(handled, true);
  assert.equal(responses.length, 1);
  assert.equal(responses[0]?.status, 200);
  assert.ok((responses[0]?.body as { capabilities: string[] }).capabilities.includes("analytics"));
});

test("platform HTTP handler preserves analytics authentication", async () => {
  const responses: Array<{ status: number; body: unknown }> = [];
  const handled = await handlePlatformHttpRoute(
    "GET",
    "/api/v1/analytics",
    async () => null,
    (status, body) => responses.push({ status, body })
  );

  assert.equal(handled, true);
  assert.deepEqual(responses, [{ status: 401, body: { error: "invalid_or_expired_session" } }]);
});

test("platform HTTP handler leaves unrelated routes to the legacy router", async () => {
  let sent = false;
  const handled = await handlePlatformHttpRoute(
    "GET",
    "/health",
    async () => null,
    () => { sent = true; }
  );

  assert.equal(handled, false);
  assert.equal(sent, false);
});
