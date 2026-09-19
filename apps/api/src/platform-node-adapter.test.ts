import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
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
