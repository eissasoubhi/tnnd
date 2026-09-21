import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { handleProductionAiHttp } from "./production-ai-http-handler.js";

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> : {};
}

function sendJson(response: import("node:http").ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

test("production AI handler works across a real Node HTTP boundary", async () => {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (await handleProductionAiHttp(request, response, url.pathname, readJsonBody, sendJson)) return;
    sendJson(response, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    const aiResponse = await fetch(`${base}/api/v1/ai/test-connection`, { method: "POST" });
    assert.equal(aiResponse.status, 401);
    assert.deepEqual(await aiResponse.json(), { error: "invalid_or_expired_session" });

    const foreignResponse = await fetch(`${base}/health`);
    assert.equal(foreignResponse.status, 404);
    assert.deepEqual(await foreignResponse.json(), { error: "not_found" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
