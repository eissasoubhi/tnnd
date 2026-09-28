import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteAccountWithPassword,
  type AccountDeletionQuery
} from "./account-deletion-service.js";

test("account deletion requires a non-empty password before querying storage", async () => {
  let queried = false;
  const query = (async () => {
    queried = true;
    return { rows: [], rowCount: 0 };
  }) as AccountDeletionQuery;

  assert.equal(await deleteAccountWithPassword("user-test", "", query, async () => true), "invalid_password");
  assert.equal(queried, false);
});

test("account deletion rejects a wrong password without deleting the account", async () => {
  const calls: string[] = [];
  const query = (async (text: string) => {
    calls.push(text);
    return text.startsWith("SELECT")
      ? { rows: [{ password_hash: "encoded-test-hash" }], rowCount: 1 }
      : { rows: [], rowCount: 1 };
  }) as AccountDeletionQuery;

  const result = await deleteAccountWithPassword(
    "user-test",
    "wrong-password",
    query,
    async () => false
  );

  assert.equal(result, "invalid_password");
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /^SELECT password_hash/);
});

test("account deletion scopes lookup and deletion to the authenticated user", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const query = (async (text: string, values: unknown[]) => {
    calls.push({ text, values });
    return text.startsWith("SELECT")
      ? { rows: [{ password_hash: "encoded-test-hash" }], rowCount: 1 }
      : { rows: [], rowCount: 1 };
  }) as AccountDeletionQuery;

  const result = await deleteAccountWithPassword(
    " user-test ",
    "correct-password",
    query,
    async (password, encoded) => password === "correct-password" && encoded === "encoded-test-hash"
  );

  assert.equal(result, "deleted");
  assert.deepEqual(calls, [
    {
      text: "SELECT password_hash FROM users WHERE id = $1 LIMIT 1",
      values: ["user-test"]
    },
    {
      text: "DELETE FROM users WHERE id = $1",
      values: ["user-test"]
    }
  ]);
});

test("account deletion returns not_found when the session account disappeared", async () => {
  const query = (async () => ({ rows: [], rowCount: 0 })) as AccountDeletionQuery;
  assert.equal(
    await deleteAccountWithPassword("missing-user", "password", query, async () => true),
    "not_found"
  );
});
