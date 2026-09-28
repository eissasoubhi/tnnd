import assert from "node:assert/strict";
import test from "node:test";
import { AccountPrivacyApiError, createAccountPrivacyClient } from "./account-privacy-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("account privacy client exports account data with bearer authentication", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createAccountPrivacyClient("session-token", {
    baseUrl: "https://tnnd.example/",
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ export: { account: { id: "user-test" } } });
    }
  });

  assert.deepEqual(await client.exportAccountData(), { account: { id: "user-test" } });
  assert.deepEqual(calls.map(({ url, init }) => [url, init?.method]), [
    ["https://tnnd.example/api/v1/account/export", "GET"]
  ]);
  assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), "Bearer session-token");
});

test("account privacy client deletes account using the supplied password only in the request body", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createAccountPrivacyClient("session-token", {
    baseUrl: "https://tnnd.example",
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ deleted: true });
    }
  });

  await client.deleteAccount("current-password");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://tnnd.example/api/v1/account");
  assert.equal(calls[0]?.init?.method, "DELETE");
  assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), "Bearer session-token");
  assert.equal(new Headers(calls[0]?.init?.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { password: "current-password" });
});

test("account privacy client preserves API status and error code", async () => {
  const client = createAccountPrivacyClient("session-token", {
    fetchImpl: async () => jsonResponse({ error: "invalid_password" }, 403)
  });

  await assert.rejects(client.deleteAccount("wrong-password"), (error: unknown) => {
    assert.ok(error instanceof AccountPrivacyApiError);
    assert.equal(error.status, 403);
    assert.equal(error.code, "invalid_password");
    return true;
  });
});
