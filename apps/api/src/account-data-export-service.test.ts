import assert from "node:assert/strict";
import test from "node:test";
import { buildAccountDataExport, type AccountExportQuery } from "./account-data-export-service.js";

test("account export scopes every persistence read to the authenticated user and excludes secrets", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];

  const query = (async (text: string, values: unknown[]) => {
    calls.push({ text, values });

    if (text.includes("FROM users ")) {
      return { rows: [{ id: "user-test", email: "user@example.invalid", created_at: new Date(0), updated_at: new Date(0) }] };
    }
    if (text.includes("FROM conversations ")) {
      return { rows: [{ id: "conversation-test", user_id: "user-test" }] };
    }
    if (text.includes("FROM conversation_messages ")) {
      return { rows: [{ id: "message-test", conversation_id: "conversation-test" }] };
    }
    return { rows: [] };
  }) as AccountExportQuery;

  const exported = await buildAccountDataExport("  user-test  ", query);

  assert.ok(exported);
  assert.equal(calls.length, 11);
  for (const call of calls) assert.deepEqual(call.values, ["user-test"]);

  const sql = calls.map((call) => call.text).join("\n").toLowerCase();
  assert.doesNotMatch(sql, /password_hash|api_key|token_hash|session_token|refresh_token/);

  assert.equal((exported.account as { id: string }).id, "user-test");
  assert.deepEqual(exported.conversations, [{ id: "conversation-test", user_id: "user-test" }]);
  assert.deepEqual(exported.messages, [{ id: "message-test", conversation_id: "conversation-test" }]);
});

test("account export refuses an empty user id without touching persistence", async () => {
  let queried = false;
  const query = (async () => {
    queried = true;
    return { rows: [] };
  }) as AccountExportQuery;

  assert.equal(await buildAccountDataExport("   ", query), null);
  assert.equal(queried, false);
});

test("account export returns null when the account no longer exists", async () => {
  const query = (async () => ({ rows: [] })) as AccountExportQuery;
  assert.equal(await buildAccountDataExport("missing-user", query), null);
});
