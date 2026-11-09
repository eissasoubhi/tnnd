import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createJournalExport } from "../src/chat-journal-export.ts";

test("Chat JSON export is versioned, bounded, and never serializes secrets or stored messages", () => {
  const start = "2026-11-09T14:28:33.000Z";
  const activity = Array.from({ length: 60 }, (_, i) => ({
    at: start, phase: i % 3 ? "checking" : "skipped", conversation: "Qamar",
    detail: "Scan entrant déjà reçu : unanswered, Bearer secret123 access_token=verySecret"
  }));
  const raw = {
    enabled: true, mode: "watcher", phase: "checking",
    phaseDetail: "Scan de la conversation Qamar",
    currentLabel: "Qamar", pendingReplies: 118,
    awaitingChatSince: start, awaitingChatScanAttempts: 2,
    lastActionAt: start, visitedCount: 3, sentCount: 0, skippedCount: 2,
    errorCount: 0, nextReplyAt: null, activity,
    token: "NEVER-EXPORT-USER-SECRET",
    refreshToken: "NEVER-EXPORT-REFRESH-SECRET",
    userId: "NEVER-EXPORT-ACCOUNT-ID",
    lastRef: "NEVER-EXPORT-TINDER-THREAD-REF",
    tabId: 454,
    savedMessageHistory: ["NEVER-EXPORT-TINDER-MESSAGE-TEXT"],
    conversationActivities: ["NEVER-EXPORT-ADDITIONAL-ACTIVITY"]
  };
  const exported = createJournalExport(raw, "0.2.51", start);
  assert.equal(exported.format, "tnnd-chat-journal");
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.extensionVersion, "0.2.51");
  assert.equal(exported.events.length, 50);
  assert.equal(exported.state.currentConversation, "Qamar");
  assert.equal(exported.state.scanAttempts, 2);
  assert.equal(exported.state.pendingReplies, 118);
  assert.equal(exported.events[0].phase, "checking");
  const json = JSON.stringify(exported);
  for (const secret of ["NEVER-EXPORT-", "verySecret", "secret123", "savedMessageHistory", "conversationActivities"]) {
    assert.equal(json.includes(secret), false, "do not leak " + secret);
  }
  assert.match(json, /Bearer \[masqué\]/);
  assert.match(json, /access_token=\[masqué\]/);
  assert.equal(Object.hasOwn(exported.state, "lastRef"), false);
  assert.equal(Object.hasOwn(exported.state, "token"), false);
});

test("malformed activity and invalid state are skipped safely, with no extra data", () => {
  const at = "2026-11-09T14:28:33.000Z";
  const exported = createJournalExport({
    enabled: false, phase: "unknown", pendingReplies: "118",
    activity: [null, "message body", { at, phase: "unknown", detail: "Hello!" },
      { at, phase: "waiting", detail: "Old incoming found", conversation: null }]
  }, "0.2.51", at);
  assert.equal(exported.state.phase, null);
  assert.equal(exported.state.pendingReplies, null);
  assert.equal(exported.events.length, 1);
  assert.equal(exported.events[0].detail, "Old incoming found");
  assert.equal(createJournalExport(null, "0.2.51", at).events.length, 0);
});

test("download button exports full journal independently of UI filter without network or send", async () => {
  const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
  const [page, ui, tests] = await Promise.all([
    "public/chat-journal.html", "src/chat-journal.ts",
    "e2e/extension.spec.mjs"
  ].map(read));
  assert.match(page, /id="downloadChatJournal"/);
  assert.match(page, /Télécharger le journal \(\.json\)/);
  assert.match(page, /id="downloadFeedback" role="status"/);
  assert.match(ui, /createJournalExport\(raw, version\)/);
  assert.match(ui, /chrome\.storage\.local\.get\(KEY\)/);
  assert.match(ui, /new Blob\(\[JSON\.stringify\(exported, null, 2\)/);
  assert.match(ui, /URL\.createObjectURL\(blob\)/);
  assert.match(ui, /link\.download = "tnnd-chat-journal-"/);
  assert.match(ui, /URL\.revokeObjectURL\(downloadUrl\)/);
  assert.match(tests, /journal\.waitForEvent\("download"\)/);
  assert.doesNotMatch(ui, /fetch\(|chrome\.tabs\.sendMessage|TNND_UNIFIED_START|TNND_UNIFIED_STOP/);
});
