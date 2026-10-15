import assert from "node:assert/strict";
import test from "node:test";
import { conversationAttention, observeConversationActivity } from "../../../src/tinder-conversation-activity.ts";
import { cappedAttentionWaitMs } from "../../../src/tinder-attention-cap.ts";
import { buildAttentionRows, effectiveAttentionWaitMs, parseAttentionState, validCap } from "./conversation-attention-model";

const at = "2026-10-16T18:00:00.000Z";
const date = Date.parse(at);
const incoming = observeConversationActivity([], "thread-A", "incoming", at)[0];
const wrap = (extra: Record<string, unknown> = {}) => ({
  capSeconds: 180, watcherActive: true, activeConversationRef: "thread-A",
  activeConversationUntil: new Date(date + 180000).toISOString(),
  observed: [incoming], ...extra
});

test("activity model matches the real extension score and cap policy", () => {
  const observed = observeConversationActivity([], "thread-A", "sent", at);
  const reply = observeConversationActivity(observed, "thread-A", "incoming",
    new Date(date + 15000).toISOString())[0];
  for (const cap of [30, 90, 180, 300, 600]) {
    const state = parseAttentionState(wrap({ capSeconds: cap, observed: [reply],
      activeConversationUntil: new Date(date + 15000 + 600000).toISOString() }));
    assert.ok(state);
    const now = date + 15000;
    const rows = buildAttentionRows(state, new Map([["thread-A", "Amina"]]), now);
    const attention = conversationAttention([reply], "thread-A", now);
    assert.equal(rows[0].score, attention.score);
    assert.equal(rows[0].waitSeconds, Math.round(cappedAttentionWaitMs(attention.waitMs, attention.score, cap)/1000));
    assert.equal(effectiveAttentionWaitMs(attention.waitMs, attention.score, cap),
      cappedAttentionWaitMs(attention.waitMs, attention.score, cap));
  }
});

test("unknown rows do not fake a score and only owned mapped refs are shown", () => {
  const state = parseAttentionState(wrap());
  assert.ok(state);
  const rows = buildAttentionRows(state, new Map([
    ["thread-A", "Amina"], ["thread-B", "Sara"]
  ]), date);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Amina");
  assert.equal(rows[0].score, 18);
  assert.equal(rows[1].score, null);
  assert.equal(rows[1].stage, "not-observed");
  assert.equal(rows[1].waitSeconds, null);
  assert.deepEqual(buildAttentionRows(state, new Map([["thread-B", "Sara"]]), date)
    .map(row => row.ref), ["thread-B"], "never expose unmapped Tinder thread");
});

test("stopped watcher has no observed scores and invalid states do not render", () => {
  const stopped = parseAttentionState(wrap({ watcherActive: false }));
  assert.ok(stopped);
  assert.equal(stopped.observed.length, 0);
  assert.equal(buildAttentionRows(stopped, new Map([["thread-A", "Amina"]]), date)[0].score, null);
  assert.equal(parseAttentionState(wrap({ capSeconds: 720 })), null);
  assert.equal(parseAttentionState(wrap({ observed: Array(201).fill(incoming) })), null);
  assert.equal(validCap(180), true);
  assert.equal(validCap(31), false);
  assert.equal(validCap(-1), false);
});

test("activity decays across days and short caps never lengthen cold chats", () => {
  const state = parseAttentionState(wrap({ capSeconds: 600 }));
  assert.ok(state);
  const rows = buildAttentionRows(state, new Map([["thread-A", "Amina"]]), date + 86400000);
  assert.equal(rows[0].score, 0);
  assert.equal(rows[0].stage, "cold");
  assert.equal(rows[0].remainingSeconds, 0);
  assert.equal(rows[0].waitSeconds, 2);
  assert.equal(cappedAttentionWaitMs(2000, 0, 600), 2000);
});
