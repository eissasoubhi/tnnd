import assert from "node:assert/strict";
import test from "node:test";
import { handleProductionPlatformRequest } from "./production-platform-route.js";

function request(method: string, authorization?: string) {
  return { method, headers: authorization ? { authorization } : {} } as never;
}

test("production platform route serves metadata without authentication", async () => {
  let sent: { status: number; body: unknown } | undefined;
  const handled = await handleProductionPlatformRequest(
    request("GET"),
    {} as never,
    "/api/v1/meta",
    (_response, status, body) => { sent = { status, body }; }
  );

  assert.equal(handled, true);
  assert.equal(sent?.status, 200);
  assert.equal((sent?.body as { apiVersion?: string }).apiVersion, "v1");
});

test("production analytics route rejects a missing bearer token before database access", async () => {
  let sent: { status: number; body: unknown } | undefined;
  const handled = await handleProductionPlatformRequest(
    request("GET"),
    {} as never,
    "/api/v1/analytics",
    (_response, status, body) => { sent = { status, body }; }
  );

  assert.equal(handled, true);
  assert.deepEqual(sent, { status: 401, body: { error: "invalid_or_expired_session" } });
});

test("production platform route leaves unrelated endpoints to the legacy router", async () => {
  let sends = 0;
  const handled = await handleProductionPlatformRequest(
    request("GET"),
    {} as never,
    "/health",
    () => { sends += 1; }
  );

  assert.equal(handled, false);
  assert.equal(sends, 0);
});
