import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleProductionAiHttp } from "./production-ai-http-handler.js";

function request(method: string, url: string): IncomingMessage {
  return { method, url, headers: {} } as IncomingMessage;
}

test("falls through without reading a body for non-AI routes", async () => {
  let reads = 0;
  let sends = 0;
  const handled = await handleProductionAiHttp(
    request("GET", "/health"),
    {} as ServerResponse,
    "/health",
    async () => { reads += 1; return {}; },
    () => { sends += 1; }
  );

  assert.equal(handled, false);
  assert.equal(reads, 0);
  assert.equal(sends, 0);
});

test("handles unauthenticated AI connection tests at the HTTP boundary", async () => {
  let reads = 0;
  let sent: { status: number; payload: unknown } | undefined;
  const handled = await handleProductionAiHttp(
    request("POST", "/api/v1/ai/test-connection"),
    {} as ServerResponse,
    "/api/v1/ai/test-connection",
    async () => { reads += 1; return {}; },
    (_response, status, payload) => { sent = { status, payload }; }
  );

  assert.equal(handled, true);
  assert.equal(reads, 0);
  assert.equal(sent?.status, 401);
  assert.deepEqual(sent?.payload, { error: "invalid_or_expired_session" });
});

test("handles unauthenticated AI provider settings reads without consuming a body", async () => {
  let reads = 0;
  let sent: { status: number; payload: unknown } | undefined;
  const handled = await handleProductionAiHttp(
    request("GET", "/api/v1/ai/provider-settings"),
    {} as ServerResponse,
    "/api/v1/ai/provider-settings",
    async () => { reads += 1; return {}; },
    (_response, status, payload) => { sent = { status, payload }; }
  );

  assert.equal(handled, true);
  assert.equal(reads, 0);
  assert.equal(sent?.status, 401);
  assert.deepEqual(sent?.payload, { error: "invalid_or_expired_session" });
});
