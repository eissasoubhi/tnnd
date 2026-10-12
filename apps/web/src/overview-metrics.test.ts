import assert from "node:assert/strict";
import test from "node:test";
import { countOverviewStatuses } from "./overview-metrics";
import type { ConversationListItem } from "./conversation-contract";

test("overview totals reflect synced conversation state instead of permanent placeholder zeroes", () => {
  const make = (status: ConversationListItem["status"], pendingHumanActions=0) => ({
    id: "id", displayName: "Test", status, pendingHumanActions, currentTopic: null
  });
  const counters = countOverviewStatuses([
    make("active"), make("waiting-for-them"), make("waiting-for-user"),
    make("action-required"), make("paused"), make("archived"),
    make("active", 2)
  ]);
  assert.deepEqual(counters, { active: 2, waitingForThem: 1, actionRequired: 3, paused: 1 });
});
test("empty account yields verified zeroes", () => {
  assert.deepEqual(countOverviewStatuses([]), { active: 0, waitingForThem: 0, actionRequired: 0, paused: 0 });
});
