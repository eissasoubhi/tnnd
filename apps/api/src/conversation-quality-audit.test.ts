import assert from "node:assert/strict";
import test from "node:test";
import { assessSavedMessages, type AuditMessage } from "./conversation-quality-audit.js";
const outgoing = (text: string): AuditMessage => ({ conversationId: "chat-1", direction: "outgoing", text });
const incoming = (text: string): AuditMessage => ({ conversationId: "chat-1", direction: "incoming", text });

test("empty or low-volume history explicitly avoids overstating accuracy", () => {
  const report = assessSavedMessages([], new Date("2026-10-17T12:00:00Z"));
  assert.equal(report.sufficientSample, false);
  assert.equal(report.metrics.emojiMessages, 0);
  assert.equal(report.findings[0]?.id, "small-sample");
  assert.equal(report.generatedAt, "2026-10-17T12:00:00.000Z");
});
test("repetitive laughter and emoji offer cautious configuration review", () => {
  const report = assessSavedMessages(Array.from({length: 12}, () => outgoing("haha super 😄")));
  assert.equal(report.outgoing, 12);
  assert.deepEqual(report.findings.slice(0,2).map(f => f.id), ["laughter","emoji"]);
  assert.deepEqual(report.findings[1]?.suggestedSetting, { key: "emojiLevel", value: "low" });
  assert.equal(JSON.stringify(report).includes("haha super"), false);
});
test("business-formal repetitive questions and very long messages are independently counted", () => {
  const report = assessSavedMessages(Array.from({length: 12}, () => outgoing("Cordialement, " + "Merci beaucoup. ".repeat(20) + "?")));
  assert.equal(report.metrics.veryLongReplies, 12);
  assert.equal(report.metrics.formalPhrases, 12);
  assert.equal(report.metrics.questions, 12);
});
test("source scope groups adjacent language pairs by conversation", () => {
  const report = assessSavedMessages([
    incoming("Salut, comment tu vas aujourd'hui ?"),
    {conversationId:"chat-2",direction:"outgoing",text:"Hello, how are you doing today?"},
    outgoing("Hello, how are you doing today?")
  ]);
  assert.equal(report.metrics.comparedLanguages, 1);
  assert.equal(report.metrics.differingLanguages, 1);
});
test("outgoing text and unique source IDs are absent from the audit report", () => {
  const privateText = "My private contact: @dont_share_123";
  const report = assessSavedMessages([outgoing(privateText)]);
  const json = JSON.stringify(report);
  assert.equal(json.includes(privateText), false);
  assert.equal(json.includes("@dont_share_123"), false);
  assert.equal(json.includes("chat-1"), false);
});
