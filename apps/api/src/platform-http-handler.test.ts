import assert from "node:assert/strict";
import test from "node:test";
import { handlePlatformHttpRoute } from "./platform-http-handler.js";

test("platform HTTP handler sends metadata responses without authenticating", async () => {
  const responses: Array<{ status: number; body: unknown }> = [];
  let authenticationCalls = 0;
  const handled = await handlePlatformHttpRoute(
    "GET",
    "/api/v1/meta",
    async () => {
      authenticationCalls += 1;
      return null;
    },
    (status, body) => responses.push({ status, body })
  );

  assert.equal(handled, true);
  assert.equal(authenticationCalls, 0);
  assert.equal(responses.length, 1);
  assert.equal(responses[0]?.status, 200);
  assert.ok((responses[0]?.body as { capabilities: string[] }).capabilities.includes("analytics"));
});

test("platform HTTP handler preserves analytics authentication", async () => {
  const responses: Array<{ status: number; body: unknown }> = [];
  let authenticationCalls = 0;
  const handled = await handlePlatformHttpRoute(
    "GET",
    "/api/v1/analytics",
    async () => {
      authenticationCalls += 1;
      return null;
    },
    (status, body) => responses.push({ status, body })
  );

  assert.equal(handled, true);
  assert.equal(authenticationCalls, 1);
  assert.deepEqual(responses, [{ status: 401, body: { error: "invalid_or_expired_session" } }]);
});

test("platform HTTP handler leaves unrelated routes to the legacy router without authenticating", async () => {
  let sent = false;
  let authenticationCalls = 0;
  const handled = await handlePlatformHttpRoute(
    "GET",
    "/health",
    async () => {
      authenticationCalls += 1;
      return null;
    },
    () => { sent = true; }
  );

  assert.equal(handled, false);
  assert.equal(authenticationCalls, 0);
  assert.equal(sent, false);
});

test("platform HTTP handler does not intercept unsupported methods", async () => {
  let sent = false;
  let authenticationCalls = 0;

  for (const pathname of ["/api/v1/meta", "/api/v1/analytics"]) {
    const handled = await handlePlatformHttpRoute(
      "POST",
      pathname,
      async () => {
        authenticationCalls += 1;
        return null;
      },
      () => { sent = true; }
    );

    assert.equal(handled, false, `${pathname} should remain unhandled for POST`);
  }

  assert.equal(authenticationCalls, 0);
  assert.equal(sent, false);
});
