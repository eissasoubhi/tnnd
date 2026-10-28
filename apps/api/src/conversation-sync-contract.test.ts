import assert from "node:assert/strict";
import test from "node:test";
import { validateConversationSyncRequest } from "./conversation-sync-contract.js";

const baseMessage = {
  externalMessageId: "msg-1",
  direction: "incoming" as const,
  text: "hello",
  sentAt: "2026-09-14T00:00:00.000Z",
};

test("accepts a bounded client-proposed nextCursor", () => {
  const result = validateConversationSyncRequest({
    externalThreadId: "thread-1",
    cursor: "msg-0",
    nextCursor: "msg-1",
    messages: [baseMessage],
  });

  assert.equal(result.cursor, "msg-0");
  assert.equal(result.nextCursor, "msg-1");
  assert.equal(result.messages.length, 1);
});

test("rejects duplicate external message ids within one sync payload", () => {
  assert.throws(
    () => validateConversationSyncRequest({
      externalThreadId: "thread-1",
      nextCursor: "msg-1",
      messages: [baseMessage, { ...baseMessage, text: "duplicate" }],
    }),
    /externalMessageId is duplicated/
  );
});

test("keeps replayable payloads valid when cursor and nextCursor are unchanged", () => {
  const payload = {
    externalThreadId: "thread-1",
    cursor: "msg-0",
    nextCursor: "msg-1",
    messages: [baseMessage],
  };

  const first = validateConversationSyncRequest(payload);
  const replay = validateConversationSyncRequest(payload);

  assert.deepEqual(replay, first);
});

test("rejects an oversized nextCursor before sync persistence", () => {
  assert.throws(
    () => validateConversationSyncRequest({
      externalThreadId: "thread-1",
      nextCursor: "x".repeat(513),
      messages: [baseMessage],
    }),
    /nextCursor exceeds 512 characters/
  );
});

test("source-verified message timestamps must be explicitly declared", () => {
  const legacy = validateConversationSyncRequest({
    externalThreadId: "thread-1",messages:[baseMessage]
  });
  assert.equal(legacy.messages[0].timestampVerified, undefined);
  const observed = validateConversationSyncRequest({
    externalThreadId: "thread-1",messages:[{...baseMessage,timestampVerified:false}]
  });
  assert.equal(observed.messages[0].timestampVerified, undefined);
  const verified = validateConversationSyncRequest({
    externalThreadId: "thread-1",messages:[{...baseMessage,timestampVerified:true}]
  });
  assert.equal(verified.messages[0].timestampVerified,true);
  assert.throws(() => validateConversationSyncRequest({
    externalThreadId: "thread-1",messages:[{...baseMessage,timestampVerified:"yes"}]
  }),/timestampVerified must be boolean/);
});
