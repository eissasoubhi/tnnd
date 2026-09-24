import assert from "node:assert/strict";
import test from "node:test";
import { createTextingStyleSourceClient, TextingStyleSourceApiError } from "./texting-style-source-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("texting style source client reads and deletes retained examples with auth", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createTextingStyleSourceClient("session-token", {
    baseUrl: "https://tnnd.example/",
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return init?.method === "DELETE"
        ? jsonResponse({ deleted: true })
        : jsonResponse({ sourceExamples: "example one", updatedAt: "2026-09-24T00:00:00.000Z" });
    }
  });

  assert.deepEqual(await client.get(), { sourceExamples: "example one", updatedAt: "2026-09-24T00:00:00.000Z" });
  assert.equal(await client.delete(), true);
  assert.deepEqual(calls.map(({ url, init }) => [url, init?.method ?? "GET"]), [
    ["https://tnnd.example/api/v1/profile/texting-style/source-examples", "GET"],
    ["https://tnnd.example/api/v1/profile/texting-style/source-examples", "DELETE"]
  ]);
  for (const call of calls) assert.equal(new Headers(call.init?.headers).get("authorization"), "Bearer session-token");
});

test("texting style source client treats missing retained examples as empty", async () => {
  const client = createTextingStyleSourceClient("session-token", { fetchImpl: async () => jsonResponse({ error: "not_found" }, 404) });
  assert.equal(await client.get(), null);
});

test("texting style source client preserves API failures", async () => {
  const client = createTextingStyleSourceClient("expired", { fetchImpl: async () => jsonResponse({ error: "invalid_or_expired_session" }, 401) });
  await assert.rejects(client.get(), (error: unknown) => {
    assert.ok(error instanceof TextingStyleSourceApiError);
    assert.equal(error.status, 401);
    assert.equal(error.message, "invalid_or_expired_session");
    return true;
  });
});
