import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteConversationData,
  deleteMatchProfileData,
  type PrivacyDeleteQuery
} from "./privacy-delete-service.js";

test("conversation deletion is user-scoped and removes dangling human actions atomically", async () => {
  let sql = "";
  let values: unknown[] = [];
  const query = (async (text: string, params: unknown[]) => {
    sql = text;
    values = params;
    return { rows: [{ id: "conversation-test" }], rowCount: 1 };
  }) as PrivacyDeleteQuery;

  assert.equal(await deleteConversationData(" user-test ", " conversation-test ", query), true);
  assert.deepEqual(values, ["user-test", "conversation-test"]);
  assert.match(sql, /DELETE FROM human_actions/);
  assert.match(sql, /DELETE FROM conversations/);
  assert.match(sql, /WHERE user_id = \$1 AND id = \$2/);
});

test("conversation deletion returns false for missing ownership or invalid ids", async () => {
  const query = (async () => ({ rows: [], rowCount: 0 })) as PrivacyDeleteQuery;
  assert.equal(await deleteConversationData("user-test", "other-conversation", query), false);

  let queried = false;
  const unusedQuery = (async () => {
    queried = true;
    return { rows: [], rowCount: 0 };
  }) as PrivacyDeleteQuery;
  assert.equal(await deleteConversationData("", "conversation-test", unusedQuery), false);
  assert.equal(await deleteConversationData("user-test", " ", unusedQuery), false);
  assert.equal(queried, false);
});

test("match profile deletion is scoped to the authenticated user", async () => {
  let sql = "";
  let values: unknown[] = [];
  const query = (async (text: string, params: unknown[]) => {
    sql = text;
    values = params;
    return { rows: [], rowCount: 1 };
  }) as PrivacyDeleteQuery;

  assert.equal(await deleteMatchProfileData("user-test", "profile-test", query), true);
  assert.equal(sql, "DELETE FROM match_profiles WHERE user_id = $1 AND id = $2");
  assert.deepEqual(values, ["user-test", "profile-test"]);
});

test("match profile deletion returns false without a matching user-owned resource", async () => {
  const query = (async () => ({ rows: [], rowCount: 0 })) as PrivacyDeleteQuery;
  assert.equal(await deleteMatchProfileData("user-test", "missing-profile", query), false);
});
