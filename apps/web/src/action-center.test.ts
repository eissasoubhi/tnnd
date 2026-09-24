import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPendingHumanActions,
  getPersistedManualAnswer,
  humanActionPausesConversation,
  sortPendingHumanActions,
  type HumanActionItem
} from "./action-center";

function action(overrides: Partial<HumanActionItem> = {}): HumanActionItem {
  return {
    id: "action-1",
    conversationRef: "conversation-1",
    conversationLabel: "Conversation",
    title: "Needs attention",
    detail: "Confirm the next step",
    severity: "action-required",
    status: "pending",
    createdAt: "2026-09-24T10:00:00.000Z",
    ...overrides
  };
}

test("pending actions are ordered by severity then newest first", () => {
  const items = [
    action({ id: "info", severity: "info", createdAt: "2026-09-24T12:00:00.000Z" }),
    action({ id: "urgent-old", severity: "urgent", createdAt: "2026-09-24T09:00:00.000Z" }),
    action({ id: "done", severity: "urgent", status: "completed" }),
    action({ id: "decision", severity: "decision-required", createdAt: "2026-09-24T13:00:00.000Z" }),
    action({ id: "urgent-new", severity: "urgent", createdAt: "2026-09-24T11:00:00.000Z" })
  ];

  assert.deepEqual(sortPendingHumanActions(items).map(({ id }) => id), [
    "urgent-new",
    "urgent-old",
    "decision",
    "info"
  ]);
});

test("severity filters never reintroduce resolved actions", () => {
  const items = [
    action({ id: "pending", severity: "decision-required" }),
    action({ id: "completed", severity: "decision-required", status: "completed" }),
    action({ id: "ignored", severity: "decision-required", status: "ignored" }),
    action({ id: "other", severity: "info" })
  ];

  assert.deepEqual(filterPendingHumanActions(items, "decision-required").map(({ id }) => id), ["pending"]);
});

test("only blocking severities with a conversation pause automation", () => {
  assert.equal(humanActionPausesConversation(action({ severity: "urgent" })), true);
  assert.equal(humanActionPausesConversation(action({ severity: "decision-required" })), true);
  assert.equal(humanActionPausesConversation(action({ severity: "action-required" })), true);
  assert.equal(humanActionPausesConversation(action({ severity: "info" })), false);
  assert.equal(humanActionPausesConversation(action({ conversationRef: null, severity: "urgent" })), false);
});

test("manual answers are accepted only when reviewed data remains explicitly not sent", () => {
  const valid = action({
    context: {
      manualAnswer: {
        answer: "  I am free after 7  ",
        source: "user-manual-answer",
        providedAt: "2026-09-24T12:30:00.000Z",
        deliveryState: "not-sent"
      }
    }
  });

  assert.equal(getPersistedManualAnswer(valid)?.answer, "  I am free after 7  ");
  assert.equal(getPersistedManualAnswer(action({ context: { manualAnswer: { ...valid.context?.manualAnswer as object, deliveryState: "sent" } } })), null);
  assert.equal(getPersistedManualAnswer(action({ context: { manualAnswer: { answer: "   ", source: "user-manual-answer", providedAt: "2026-09-24T12:30:00.000Z", deliveryState: "not-sent" } } })), null);
});
