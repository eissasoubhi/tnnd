import assert from "node:assert/strict";
import test from "node:test";
import { parseSmartSwipeHistory, parseSmartSwipeSummary, remainingSmartSwipeAttempts, smartSwipeLedgerError } from "./smart-swipe-dashboard-model.js";

test("ledger counts are validated before the UI treats them as available", () => {
  assert.equal(parseSmartSwipeSummary(null), null);
  assert.equal(parseSmartSwipeSummary({ dayKey: "2026-10-18", attemptsToday: 1,
    uiObservedToday: 2, unresolvedAttempts: 0 }), null);
  const summary = parseSmartSwipeSummary({ dayKey: "2026-10-18", attemptsToday: 3,
    uiObservedToday: 1, unresolvedAttempts: 1 });
  assert.ok(summary);
  assert.equal(remainingSmartSwipeAttempts(summary, 5), 2);
  assert.equal(remainingSmartSwipeAttempts(summary, 2), 0);
  assert.equal(remainingSmartSwipeAttempts(summary, Number.NaN), null);
});

test("history distinguishes reserved, uncertain and UI-observed attempts", () => {
  const history = parseSmartSwipeHistory({ attempts: [
    { dayKey: "2026-10-18", status: "reserved",
      createdAt: "2026-10-18T09:00:00.000Z", resolvedAt: null },
    { dayKey: "2026-10-17", status: "uncertain",
      createdAt: "2026-10-17T09:00:00.000Z", resolvedAt: "2026-10-17T09:00:02.000Z" },
    { dayKey: "2026-10-16", status: "ui_observed",
      createdAt: "2026-10-16T09:00:00.000Z", resolvedAt: "2026-10-16T09:00:02.000Z" }
  ] });
  assert.equal(history?.length, 3);
  assert.equal(parseSmartSwipeHistory({ attempts: [{ status: "server_confirmed" }] }), null);
});

test("failed ledger reads show actionable diagnostics without inventing empty counters", () => {
  assert.match(smartSwipeLedgerError("summary", "network"), /backend is running/i);
  assert.match(smartSwipeLedgerError("summary", 401), /sign in again/i);
  assert.match(smartSwipeLedgerError("history", 403), /access denied/i);
  assert.match(smartSwipeLedgerError("history", 404), /update and restart/i);
  assert.match(smartSwipeLedgerError("summary", 500), /PostgreSQL migrations/i);
  assert.match(smartSwipeLedgerError("summary", 503), /do not reset attempt data/i);
  assert.match(smartSwipeLedgerError("history", "invalid"), /compatible versions/i);
  assert.match(smartSwipeLedgerError("history", 429), /HTTP 429/);
});
