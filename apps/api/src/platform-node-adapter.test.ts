import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AnalyticsSnapshot } from "./analytics-service.js";
import { handleNodePlatformRequest } from "./platform-node-adapter.js";

test("node platform adapter forwards metadata responses", async () => {
  const request = { method: "GET" } as IncomingMessage;
  const response = {} as ServerResponse;
  let sent: { status: number; body: unknown } | undefined;

  const handled = await handleNodePlatformRequest(
    request,
    response,
    "/api/v1/meta",
    async () => null,
    (_response, status, body) => {
      assert.equal(_response, response);
      sent = { status, body };
    }
  );

  assert.equal(handled, true);
  assert.equal(sent?.status, 200);
  assert.equal((sent?.body as { apiVersion?: string }).apiVersion, "v1");
});

test("node platform adapter forwards authenticated analytics responses", async () => {
  const request = { method: "GET" } as IncomingMessage;
  const response = {} as ServerResponse;
  let sent: { status: number; body: unknown } | undefined;
  let loadedUserId = "";
  const snapshot: AnalyticsSnapshot = {
    generatedAt: "2026-01-01T00:00:00.000Z",
    active: 1,
    paused: 0,
    disabled: 0,
    waitingForThem: 0,
    waitingForUser: 0,
    actionRequired: 0,
    movedOffTinder: 0,
    stale: 0,
    archived: 0,
    pendingHumanActions: 0,
    memoryCoverage: []
  };

  const handled = await handleNodePlatformRequest(
    request,
    response,
    "/api/v1/analytics",
    async () => ({ user: { id: "user-123" } }),
    (_response, status, body) => {
      assert.equal(_response, response);
      sent = { status, body };
    },
    async (userId) => {
      loadedUserId = userId;
      return snapshot;
    }
  );

  assert.equal(handled, true);
  assert.equal(loadedUserId, "user-123");
  assert.equal(sent?.status, 200);
  assert.deepEqual(sent?.body, snapshot);
});

test("node platform adapter rejects unauthenticated analytics before loading data", async () => {
  const request = { method: "GET" } as IncomingMessage;
  const response = {} as ServerResponse;
  let sent: { status: number; body: unknown } | undefined;
  let loads = 0;

  const handled = await handleNodePlatformRequest(
    request,
    response,
    "/api/v1/analytics",
    async () => null,
    (_response, status, body) => {
      sent = { status, body };
    },
    async () => {
      loads += 1;
      throw new Error("analytics loader must not run without a session");
    }
  );

  assert.equal(handled, true);
  assert.equal(loads, 0);
  assert.equal(sent?.status, 401);
  assert.deepEqual(sent?.body, { error: "invalid_or_expired_session" });
});

test("node platform adapter leaves unrelated routes untouched", async () => {
  const request = { method: "GET" } as IncomingMessage;
  const response = {} as ServerResponse;
  let sends = 0;

  const handled = await handleNodePlatformRequest(
    request,
    response,
    "/health",
    async () => null,
    () => {
      sends += 1;
    }
  );

  assert.equal(handled, false);
  assert.equal(sends, 0);
});
