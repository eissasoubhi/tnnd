import assert from "node:assert/strict";
import test from "node:test";
import { conversationEmptyState, hasConversationFilters, isCurrentConversationResponse } from "./conversation-list-ui";

test("filters detect a changed status or trimmed query", () => {
  assert.equal(hasConversationFilters(" ", "all"), false);
  assert.equal(hasConversationFilters("Maya", "all"), true);
  assert.equal(hasConversationFilters("", "paused"), true);
});

test("zero synced chats and zero filter matches receive distinct instructions", () => {
  assert.match(conversationEmptyState(0, false).heading, /No conversations synced yet/);
  assert.match(conversationEmptyState(0, true).guidance, /Import visible chat/);
  assert.match(conversationEmptyState(8, true).heading, /No matching conversations/);
  assert.match(conversationEmptyState(8, true).guidance, /Clear filters/);
  assert.doesNotMatch(conversationEmptyState(0, false).guidance, /Clear filters/);
});

test("stale requests and previous-account results cannot pass the response guard", () => {
  assert.equal(isCurrentConversationResponse(4, 4, "account-A", "account-A"), true);
  assert.equal(isCurrentConversationResponse(3, 4, "account-A", "account-A"), false);
  assert.equal(isCurrentConversationResponse(4, 4, "account-A", "account-B"), false);
  assert.equal(isCurrentConversationResponse(4, 4, "account-A", null), false);
  assert.equal(isCurrentConversationResponse(4, 4, "", ""), false);
});
