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


test("defaults to newest synced conversation, with oldest and longest alternatives", () => {
  const a = [
    { ...conversations[0]!, lastMessageAt: "2026-10-15T12:00:00Z", messageCount: 4 },
    { ...conversations[1]!, lastMessageAt: "2026-10-16T12:00:00Z", messageCount: 15 },
    { ...conversations[2]!, lastMessageAt: "2026-10-14T12:00:00Z", messageCount: 31 }
  ];
  assert.deepEqual(filterConversationSummaries(a, { status: "all", query: "" }).map(x => x.id), ["2", "1", "3"]);
  assert.deepEqual(filterConversationSummaries(a, { status: "all", query: "", sort: "oldest" }).map(x => x.id), ["3", "1", "2"]);
  assert.deepEqual(filterConversationSummaries(a, { status: "all", query: "", sort: "longest" }).map(x => x.id), ["3", "2", "1"]);
});

test("combines age, multiple verified cities, match dating goal and contact source", () => {
  const a = [
    { ...conversations[0]!, matchAge: 28, matchCity: "Casablanca", matchDatingGoal: "Casual dating", matchSharedInstagram: true, messageCount: 7 },
    { ...conversations[1]!, matchAge: 31, matchCity: "Paris", matchDatingGoal: "Serious", matchSharedWhatsapp: true, messageCount: 24 },
    { ...conversations[2]!, matchAge: null, matchCity: null, messageCount: 2 }
  ];
  assert.deepEqual(filterConversationSummaries(a, {
    status: "all", query: "", ageMin: 25, ageMax: 30,
    cities: ["Rabat", "Casablanca"], datingGoal: "casual dating", matchContact: "instagram", length: "developing"
  }).map(x => x.id), ["1"]);
  assert.deepEqual(filterConversationSummaries(a, { status: "all", query: "", ageMin: 28, ageMax: 30, cities: ["Paris"] }), []);
});

test("message content search uses backend-confirmed IDs only", () => {
  assert.deepEqual(filterConversationSummaries(conversations, { status: "all", query: "", messageSearchIds: ["3", "1"] }).map(x => x.id), ["1", "3"]);
  assert.deepEqual(filterConversationSummaries(conversations, { status: "all", query: "", messageSearchIds: [] }), []);
});


test("semantic stage/tone filters combine with existing status and do not guess unknowns", () => {
  const items: ConversationListItem[] = [
    { ...conversations[0]!, id: "intro", semanticStage: "introductions", semanticTone: null, semanticSource: "rule-based" },
    { ...conversations[1]!, id: "dating", semanticStage: "date-discussion", semanticTone: "flirty", semanticSource: "rule-based" },
    { ...conversations[2]!, id: "unknown", semanticStage: null, semanticTone: null, semanticSource: "unknown" }
  ];
  assert.deepEqual(filterConversationSummaries(items, { status: "all", query: "", semanticStage: "date-discussion", semanticTone: "flirty" }).map(x=>x.id), ["dating"]);
  assert.deepEqual(filterConversationSummaries(items, { status: "all", query: "", semanticStage: "unknown" }).map(x=>x.id), ["unknown"]);
  assert.deepEqual(filterConversationSummaries(items, { status: "all", query: "", semanticTone: "unknown" }).map(x=>x.id), ["intro","unknown"]);
  assert.deepEqual(filterConversationSummaries(items, { status: "active", query: "", semanticStage: "date-discussion" }), []);
});
