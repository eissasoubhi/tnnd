import assert from "node:assert/strict";
import test from "node:test";
import { filterConversationSummaries } from "./conversation-list-filter";
import type { ConversationListItem } from "./conversation-contract";

const conversations: ConversationListItem[] = [
  { id: "1", displayName: "Léa", status: "active", currentTopic: "Voyage à Paris", pendingHumanActions: 0 },
  { id: "2", displayName: "Maya", status: "waiting-for-user", currentTopic: "Weekend plans", pendingHumanActions: 1 },
  { id: "3", displayName: "ليلى", status: "paused", currentTopic: "القهوة", pendingHumanActions: 0 },
  { id: "4", displayName: "Lina", status: "active", currentTopic: null, pendingHumanActions: 0 }
];

test("shows all conversations with no search or status filter", () => {
  assert.deepEqual(filterConversationSummaries(conversations, { status: "all", query: "" }).map((item) => item.id), ["1", "2", "3", "4"]);
});

test("combines status with case- and accent-insensitive search", () => {
  assert.deepEqual(filterConversationSummaries(conversations, { status: "active", query: "lea" }).map((item) => item.id), ["1"]);
  assert.deepEqual(filterConversationSummaries(conversations, { status: "active", query: "weekend" }), []);
});

test("searches both name and topic using all query terms", () => {
  assert.deepEqual(filterConversationSummaries(conversations, { status: "all", query: "  Maya  weekend " }).map((item) => item.id), ["2"]);
  assert.deepEqual(filterConversationSummaries(conversations, { status: "all", query: "voyage Paris" }).map((item) => item.id), ["1"]);
});

test("supports Arabic and does not mutate input order", () => {
  assert.deepEqual(filterConversationSummaries(conversations, { status: "all", query: "ليلى" }).map((item) => item.id), ["3"]);
  assert.deepEqual(conversations.map((item) => item.id), ["1", "2", "3", "4"]);
});
